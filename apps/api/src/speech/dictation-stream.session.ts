/**
 * One live dictation: PCM in, growing transcript out.
 *
 * The engine (Hex) only transcribes whole clips, so "streaming" is built on top:
 * the session keeps the PCM that is not yet settled (the *tail*), re-transcribes
 * only that tail as the speaker goes on (the *interim*), and at every pause
 * commits the audio before the pause — its text never changes again and its PCM
 * is dropped. Cost per request is therefore bounded by the length of one phrase,
 * not of the whole recording.
 *
 * Pure: no I/O of its own. The caller supplies `transcribe` and receives `emit`.
 */

/** PCM format the session expects: 16 kHz, mono, signed 16-bit little-endian. */
export const PCM_SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_MS = (PCM_SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000;
/** Energy is measured per 20 ms frame. */
const FRAME_BYTES = 20 * BYTES_PER_MS;

export interface DictationStreamOptions {
  /** A frame quieter than this RMS (int16 units) is silence. Tune per microphone. */
  silenceRms: number;
  /** A pause must last this long before the audio ahead of it is committed. */
  pauseMs: number;
  /** Never commit less than this — a too-short clip transcribes badly. */
  minCommitMs: number;
  /** Don't bother transcribing an interim shorter than this. */
  minInterimMs: number;
  /** With no pause at all, force a commit once the tail grows past this. */
  maxTailMs: number;
}

export const DEFAULT_DICTATION_STREAM_OPTIONS: DictationStreamOptions = {
  silenceRms: 500,
  pauseMs: 500,
  minCommitMs: 1_000,
  minInterimMs: 600,
  maxTailMs: 20_000,
};

export interface DictationStreamUpdate {
  /** Everything heard so far: the committed phrases plus the current interim. */
  text: string;
  /** `true` exactly once, on the last update after `finish()`. */
  final: boolean;
}

export type TranscribePcm = (pcm: Buffer) => Promise<string>;

/** RMS of one frame of s16le PCM. */
function frameRms(pcm: Buffer, offset: number): number {
  let sum = 0;
  for (let i = offset; i < offset + FRAME_BYTES; i += BYTES_PER_SAMPLE) {
    const sample = pcm.readInt16LE(i);
    sum += sample * sample;
  }
  return Math.sqrt(sum / (FRAME_BYTES / BYTES_PER_SAMPLE));
}

/** Whether any whole frame of `pcm` is louder than silence. */
function hasSpeech(pcm: Buffer, options: DictationStreamOptions): boolean {
  for (let offset = 0; offset + FRAME_BYTES <= pcm.length; offset += FRAME_BYTES) {
    if (frameRms(pcm, offset) >= options.silenceRms) return true;
  }
  return false;
}

/** Where to cut the tail, and whether the part before the cut holds any speech. */
export interface CommitPoint {
  /** Byte offset (frame-aligned) to commit up to; `0` = nothing to commit yet. */
  cut: number;
  /**
   * Whether there is any speech before the cut (in the whole clip when `cut` is 0).
   * `false` = pure silence — drop it, don't hand it to the engine.
   */
  speech: boolean;
}

/**
 * Find the commit point in `pcm`: the middle of the *last* pause of at least
 * `pauseMs` that has at least `minCommitMs` of audio before it. With no such
 * pause and a tail longer than `maxTailMs`, cut at the quietest frame of the
 * back half instead, so an unbroken monologue still settles.
 */
export function findCommitPoint(pcm: Buffer, options: DictationStreamOptions): CommitPoint {
  const frames = Math.floor(pcm.length / FRAME_BYTES);
  const pauseFrames = Math.ceil((options.pauseMs * BYTES_PER_MS) / FRAME_BYTES);
  const minCommitFrames = Math.ceil((options.minCommitMs * BYTES_PER_MS) / FRAME_BYTES);

  const silent: boolean[] = [];
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    const value = frameRms(pcm, f * FRAME_BYTES);
    rms.push(value);
    silent.push(value < options.silenceRms);
  }

  // Walk back over silence runs; take the last one that is long enough and late enough.
  let end = frames;
  while (end > 0) {
    if (!silent[end - 1]) {
      end--;
      continue;
    }
    let start = end - 1;
    while (start > 0 && silent[start - 1]) start--;
    const middle = start + Math.floor((end - start) / 2);
    if (end - start >= pauseFrames && middle >= minCommitFrames) {
      return { cut: middle * FRAME_BYTES, speech: silent.slice(0, start).includes(false) };
    }
    end = start;
  }

  if (pcm.length > options.maxTailMs * BYTES_PER_MS) {
    let quietest = Math.floor(frames / 2);
    for (let f = quietest; f < frames; f++) {
      if ((rms[f] ?? Infinity) < (rms[quietest] ?? Infinity)) quietest = f;
    }
    return { cut: quietest * FRAME_BYTES, speech: true };
  }
  return { cut: 0, speech: silent.includes(false) };
}

/** A 16 kHz mono s16le WAV (44-byte header with real lengths — Hex rejects a header without them). */
export function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(PCM_SAMPLE_RATE * BYTES_PER_SAMPLE, 28); // byte rate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export class DictationStreamSession {
  private tail: Buffer = Buffer.alloc(0);
  private readonly committed: string[] = [];
  private interim = "";
  /** New audio arrived since the last transcription started. */
  private dirty = false;
  private finishing = false;
  /** The single in-flight pump, if any — at most one transcription runs at a time. */
  private pumping: Promise<void> | null = null;

  constructor(
    private readonly transcribe: TranscribePcm,
    private readonly emit: (update: DictationStreamUpdate) => void,
    private readonly options: DictationStreamOptions = DEFAULT_DICTATION_STREAM_OPTIONS,
  ) {}

  /** Feed decoded PCM (any size; need not be frame-aligned). */
  push(pcm: Buffer): void {
    if (this.finishing || pcm.length === 0) return;
    this.tail = Buffer.concat([this.tail, pcm]);
    this.dirty = true;
    this.pump();
  }

  /**
   * No more audio is coming: commit whatever is left and resolve with the full
   * transcript. Rejects when the last transcription fails — the caller still
   * holds the recording and can fall back to a one-shot transcription.
   */
  async finish(): Promise<string> {
    this.finishing = true;
    await this.pumping?.catch(() => undefined);
    // Even bytes only: a dangling half-sample cannot be decoded.
    const rest = this.tail.subarray(0, this.tail.length - (this.tail.length % BYTES_PER_SAMPLE));
    this.tail = Buffer.alloc(0);
    if (hasSpeech(rest, this.options)) {
      const text = await this.transcribe(rest);
      if (text) this.committed.push(text);
    }
    this.interim = "";
    const text = this.text();
    this.emit({ text, final: true });
    return text;
  }

  private text(): string {
    return [...this.committed, this.interim].filter(Boolean).join(" ");
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = this.drain().finally(() => {
      this.pumping = null;
    });
    // A failed interim is not an error worth surfacing — the next push retries.
    this.pumping.catch(() => undefined);
  }

  private async drain(): Promise<void> {
    while (this.dirty && !this.finishing) {
      this.dirty = false;
      // `tail` only ever grows at the end while we await, so offsets into this snapshot stay valid.
      const snapshot = this.tail;
      const { cut, speech } = findCommitPoint(snapshot, this.options);
      if (cut > 0) {
        const text = speech ? await this.transcribe(snapshot.subarray(0, cut)) : "";
        if (this.finishing) return; // finish() owns the tail now
        if (text) this.committed.push(text);
        this.tail = this.tail.subarray(cut);
        this.interim = "";
        // What followed the pause still needs its own interim.
        if (this.tail.length >= this.options.minInterimMs * BYTES_PER_MS) this.dirty = true;
      } else if (speech && snapshot.length >= this.options.minInterimMs * BYTES_PER_MS) {
        const text = await this.transcribe(snapshot);
        if (this.finishing) return;
        this.interim = text;
      } else {
        continue;
      }
      this.emit({ text: this.text(), final: false });
    }
  }
}
