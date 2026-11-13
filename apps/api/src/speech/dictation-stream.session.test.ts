import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DICTATION_STREAM_OPTIONS,
  DictationStreamSession,
  type DictationStreamUpdate,
  findCommitPoint,
  pcmToWav,
} from "./dictation-stream.session";

const BYTES_PER_MS = 32;

/** `ms` of s16le PCM at a constant amplitude (0 = silence). */
function pcm(ms: number, amplitude: number): Buffer {
  const buf = Buffer.alloc(ms * BYTES_PER_MS);
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(i % 4 === 0 ? amplitude : -amplitude, i);
  return buf;
}
const speech = (ms: number) => pcm(ms, 8_000);
const silence = (ms: number) => pcm(ms, 0);

/** Resolves once the session has gone quiet (no in-flight transcription). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(transcribe = vi.fn(async (clip: Buffer) => `t${clip.length / BYTES_PER_MS}`)) {
  const updates: DictationStreamUpdate[] = [];
  const session = new DictationStreamSession(transcribe, (u) => updates.push(u));
  return { session, transcribe, updates };
}

describe("findCommitPoint", () => {
  const options = DEFAULT_DICTATION_STREAM_OPTIONS;

  it("has nothing to commit while the speaker keeps going", () => {
    expect(findCommitPoint(speech(3_000), options).cut).toBe(0);
  });

  it("cuts in the middle of a long enough pause", () => {
    const point = findCommitPoint(
      Buffer.concat([speech(2_000), silence(600), speech(400)]),
      options,
    );
    expect(point).toEqual({ cut: 2_300 * BYTES_PER_MS, speech: true });
  });

  it("ignores a pause that is too short", () => {
    expect(
      findCommitPoint(Buffer.concat([speech(2_000), silence(200), speech(400)]), options).cut,
    ).toBe(0);
  });

  it("ignores a pause with too little audio before it", () => {
    expect(findCommitPoint(Buffer.concat([speech(300), silence(600)]), options).cut).toBe(0);
  });

  it("flags leading silence as speechless so it is dropped, not transcribed", () => {
    expect(findCommitPoint(silence(3_000), options)).toEqual({
      cut: 1_500 * BYTES_PER_MS,
      speech: false,
    });
  });

  it("forces a cut at the quietest frame when the tail outgrows the cap", () => {
    const point = findCommitPoint(
      Buffer.concat([speech(15_000), pcm(100, 1_000), speech(6_000)]),
      options,
    );
    expect(point).toEqual({ cut: 15_000 * BYTES_PER_MS, speech: true });
  });
});

describe("pcmToWav", () => {
  it("writes a header carrying the real lengths", () => {
    const wav = pcmToWav(speech(100));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(36 + 3_200);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(40)).toBe(3_200);
    expect(wav.length).toBe(44 + 3_200);
  });
});

describe("DictationStreamSession", () => {
  it("emits a growing interim while the speaker keeps going", async () => {
    const { session, updates } = setup();
    session.push(speech(1_000));
    await settle();
    session.push(speech(1_000));
    await settle();
    expect(updates).toEqual([
      { text: "t1000", final: false },
      { text: "t2000", final: false },
    ]);
  });

  it("waits for enough audio before the first interim", async () => {
    const { session, transcribe } = setup();
    session.push(speech(300));
    await settle();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("commits at a pause and transcribes only what follows from then on", async () => {
    const { session, transcribe, updates } = setup();
    session.push(Buffer.concat([speech(2_000), silence(600)]));
    await settle();
    session.push(speech(1_000));
    await settle();
    // First call: the 2 s phrase + half the pause. Second: the other half + the new second.
    expect(transcribe.mock.calls.map(([clip]) => clip.length / BYTES_PER_MS)).toEqual([
      2_300, 1_300,
    ]);
    expect(updates.at(-1)).toEqual({ text: "t2300 t1300", final: false });
  });

  it("runs one transcription at a time and coalesces audio that arrives meanwhile", async () => {
    let release: (text: string) => void = () => undefined;
    const transcribe = vi.fn(
      (_clip: Buffer) =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const { session } = setup(transcribe);
    session.push(speech(1_000));
    session.push(speech(500));
    session.push(speech(500));
    expect(transcribe).toHaveBeenCalledTimes(1);
    release("first");
    await settle();
    // One follow-up over everything that piled up — not one per push.
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(transcribe.mock.calls[1]?.[0].length).toBe(2_000 * BYTES_PER_MS);
  });

  it("drops leading silence without asking the engine", async () => {
    const { session, transcribe, updates } = setup();
    session.push(silence(3_000));
    await settle();
    expect(transcribe).not.toHaveBeenCalled();
    expect(updates).toEqual([{ text: "", final: false }]);
  });

  it("finish commits the rest and emits the final transcript once", async () => {
    const { session, updates } = setup();
    session.push(Buffer.concat([speech(2_000), silence(600)]));
    await settle();
    session.push(speech(400));
    await expect(session.finish()).resolves.toBe("t2300 t700");
    expect(updates.at(-1)).toEqual({ text: "t2300 t700", final: true });
    expect(updates.filter((u) => u.final)).toHaveLength(1);
  });

  it("finish waits for an in-flight interim and ignores its late result", async () => {
    const pending: ((text: string) => void)[] = [];
    const transcribe = vi.fn(
      (_clip: Buffer) => new Promise<string>((resolve) => pending.push(resolve)),
    );
    const { session, updates } = setup(transcribe);
    session.push(speech(1_000));
    const done = session.finish();
    pending[0]?.("stale interim");
    await settle();
    pending[1]?.("the whole clip");
    await expect(done).resolves.toBe("the whole clip");
    expect(updates).toEqual([{ text: "the whole clip", final: true }]);
  });

  it("ignores audio pushed after finish", async () => {
    const { session, transcribe } = setup();
    await session.finish();
    session.push(speech(2_000));
    await settle();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("survives a failed interim and retries on the next audio", async () => {
    const transcribe = vi
      .fn<(clip: Buffer) => Promise<string>>()
      .mockRejectedValueOnce(new Error("busy"))
      .mockResolvedValue("ok");
    const { session, updates } = setup(transcribe);
    session.push(speech(1_000));
    await settle();
    session.push(speech(500));
    await settle();
    expect(updates).toEqual([{ text: "ok", final: false }]);
  });

  it("finish rejects when the last transcription fails", async () => {
    const { session } = setup(vi.fn().mockRejectedValue(new Error("hex gone")));
    session.push(speech(400));
    await expect(session.finish()).rejects.toThrow("hex gone");
  });
});
