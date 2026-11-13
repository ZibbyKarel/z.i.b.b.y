import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { SpeechDictationStartInput } from "@zibby/contracts";
import { type Observable, ReplaySubject } from "rxjs";
import { DictationStreamSession, type DictationStreamUpdate } from "./dictation-stream.session";
import { SttService, SttTranscriptionError, SttUnavailableError, findFfmpeg } from "./stt.service";

/** No session with that id — never opened, already finished, or expired. Maps to `404`. */
export class DictationSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Dictation session ${id} not found (finished or expired)`);
    this.name = "DictationSessionNotFoundError";
  }
}

/** A session with no audio upload for this long is abandoned (tab closed, network gone). */
export const DICTATION_IDLE_MS = 30_000;
/** Hard ceiling on one session, finished or not — bounds a runaway client. */
export const DICTATION_MAX_MS = 4 * 60_000;

/**
 * Decode the MediaRecorder stream (webm/opus, mp4/aac) to 16 kHz mono s16le on
 * stdout as it arrives — verified to emit PCM incrementally from a pipe with these
 * plain flags, no `-fflags nobuffer`/probe tuning needed.
 */
const FFMPEG_ARGS = [
  "-loglevel",
  "error",
  "-i",
  "pipe:0",
  "-f",
  "s16le",
  "-ar",
  "16000",
  "-ac",
  "1",
  "pipe:1",
];

interface LiveDictation {
  ffmpeg: ChildProcessWithoutNullStreams;
  session: DictationStreamSession;
  updates: ReplaySubject<DictationStreamUpdate>;
  /** Resolves with ffmpeg's exit code (`null` = killed / failed to spawn) once its stdio closed. */
  exited: Promise<number | null>;
  pcmBytes: number;
  finishing: boolean;
  idle: NodeJS.Timeout;
  max: NodeJS.Timeout;
}

/**
 * Live streaming dictations: one long-lived ffmpeg per session turns the uploaded
 * MediaRecorder chunks into PCM, which feeds a {@link DictationStreamSession}
 * (pause-committed incremental transcription through Hex). Updates fan out on a
 * per-session `ReplaySubject(1)` so a late SSE subscriber still gets the latest text.
 *
 * Nothing outlives its session: idle and max-length timers destroy abandoned ones,
 * and `onModuleDestroy` kills every ffmpeg and completes every stream so shutdown
 * never waits on a dictation.
 */
@Injectable()
export class DictationStreamService implements OnModuleDestroy {
  private readonly sessions = new Map<string, LiveDictation>();

  constructor(private readonly stt: SttService) {}

  async create(input: SpeechDictationStartInput): Promise<{ id: string }> {
    const status = await this.stt.status();
    if (!status.available) throw new SttUnavailableError(status.reason ?? "unknown reason");
    const bin = await findFfmpeg();
    if (!bin) throw new SttUnavailableError("ffmpeg not found — brew install ffmpeg");

    const id = randomUUID();
    const ffmpeg = spawn(bin, FFMPEG_ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    const updates = new ReplaySubject<DictationStreamUpdate>(1);
    const session = new DictationStreamSession(
      (pcm) => this.stt.transcribePcm(pcm, input.language),
      (update) => updates.next(update),
    );
    const exited = new Promise<number | null>((resolve) => {
      ffmpeg.once("close", (code) => resolve(code));
      ffmpeg.once("error", () => resolve(null));
    });
    // EPIPE when ffmpeg dies mid-write — `finish()` reports the failure, not a crash.
    ffmpeg.stdin.on("error", () => undefined);
    ffmpeg.stderr.resume();

    const live: LiveDictation = {
      ffmpeg,
      session,
      updates,
      exited,
      pcmBytes: 0,
      finishing: false,
      idle: this.idleTimer(id),
      max: setTimeout(() => this.destroy(id), DICTATION_MAX_MS).unref(),
    };
    ffmpeg.stdout.on("data", (pcm: Buffer) => {
      live.pcmBytes += pcm.length;
      session.push(pcm);
    });
    this.sessions.set(id, live);
    return { id };
  }

  /** Append one MediaRecorder chunk, in arrival order; resolves once ffmpeg accepted it. */
  async write(id: string, chunk: Buffer): Promise<void> {
    const live = this.live(id);
    clearTimeout(live.idle);
    live.idle = this.idleTimer(id);
    const { stdin } = live.ffmpeg;
    if (chunk.length === 0 || !stdin.writable) return;
    if (stdin.write(chunk)) return;
    // Backpressure: wait for ffmpeg to catch up — or to die, which never drains.
    await new Promise<void>((resolve) => {
      const done = () => {
        stdin.off("drain", done);
        stdin.off("close", done);
        resolve();
      };
      stdin.once("drain", done);
      stdin.once("close", done);
    });
  }

  /** The session's updates; completes after the `final` one (or when the session is destroyed). */
  events(id: string): Observable<DictationStreamUpdate> {
    // Still subscribable while finishing — the final update is on its way.
    const live = this.sessions.get(id);
    if (!live) throw new DictationSessionNotFoundError(id);
    return live.updates.asObservable();
  }

  /**
   * No more audio: flush ffmpeg, transcribe the rest and return the full transcript.
   * The session is gone afterwards whether this resolves or rejects.
   */
  async finish(id: string): Promise<string> {
    const live = this.live(id);
    live.finishing = true;
    clearTimeout(live.idle);
    live.ffmpeg.stdin.end();
    try {
      // `close` fires after stdout ended, so every decoded byte has been pushed.
      // The max-length timer still runs and kills a hung ffmpeg.
      const code = await live.exited;
      if (code !== 0 && live.pcmBytes === 0) {
        throw new SttTranscriptionError("could not decode the audio");
      }
      return await live.session.finish();
    } finally {
      this.destroy(id);
    }
  }

  onModuleDestroy(): void {
    for (const id of [...this.sessions.keys()]) this.destroy(id);
  }

  private live(id: string): LiveDictation {
    const live = this.sessions.get(id);
    if (!live || live.finishing) throw new DictationSessionNotFoundError(id);
    return live;
  }

  private idleTimer(id: string): NodeJS.Timeout {
    return setTimeout(() => this.destroy(id), DICTATION_IDLE_MS).unref();
  }

  private destroy(id: string): void {
    const live = this.sessions.get(id);
    if (!live) return;
    this.sessions.delete(id);
    clearTimeout(live.idle);
    clearTimeout(live.max);
    if (live.ffmpeg.exitCode === null && live.ffmpeg.signalCode === null) {
      live.ffmpeg.kill("SIGKILL");
    }
    live.updates.complete();
  }
}
