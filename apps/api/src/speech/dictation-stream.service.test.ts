import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { lastValueFrom, toArray } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in for ffmpeg's ChildProcess: like the real one, `close` fires only after stdout ended. */
class FakeFfmpeg extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: string | null = null;
  written: Buffer[] = [];
  kill = vi.fn((signal: string) => {
    this.signalCode = signal;
    this.exit(null);
  });

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => this.written.push(chunk));
  }

  exit(code: number | null): void {
    if (code !== null) this.exitCode = code;
    this.stdout.once("end", () => this.emit("close", code));
    this.stdout.end();
    this.stdout.resume();
  }
}

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), procs: [] as unknown[] }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: mocks.spawn,
}));
vi.mock("./stt.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stt.service")>()),
  findFfmpeg: async () => "/usr/bin/ffmpeg",
}));

import {
  DICTATION_IDLE_MS,
  DictationSessionNotFoundError,
  DictationStreamService,
} from "./dictation-stream.service";
import { SttService, SttTranscriptionError, SttUnavailableError } from "./stt.service";

/** 1.5 s of loud 16 kHz s16le audio — enough for the session to treat it as speech. */
function speech(ms = 1500): Buffer {
  const pcm = Buffer.alloc(ms * 32);
  for (let i = 0; i < pcm.length / 2; i++) {
    pcm.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), i * 2);
  }
  return pcm;
}

describe("DictationStreamService", () => {
  const status = vi.fn();
  const transcribePcm = vi.fn();
  let service: DictationStreamService;
  const proc = (n = 0) => mocks.procs[n] as FakeFfmpeg;

  beforeEach(() => {
    mocks.procs.length = 0;
    mocks.spawn.mockImplementation(() => {
      const fake = new FakeFfmpeg();
      mocks.procs.push(fake);
      return fake;
    });
    status.mockResolvedValue({ available: true });
    transcribePcm.mockResolvedValue("ahoj");
    service = new DictationStreamService({ status, transcribePcm } as unknown as SttService);
  });
  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("refuses to open a session when STT is unavailable", async () => {
    status.mockResolvedValue({ available: false, reason: "Hex is not running" });
    await expect(service.create({ mimeType: "audio/webm" })).rejects.toBeInstanceOf(
      SttUnavailableError,
    );
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("create → write → finish: chunks reach ffmpeg in order, PCM is transcribed, the stream completes with the final update", async () => {
    const { id } = await service.create({ mimeType: "audio/webm", language: "en" });
    const [, args] = mocks.spawn.mock.calls[0] as [string, string[]];
    expect(args.join(" ")).toBe("-loglevel error -i pipe:0 -f s16le -ar 16000 -ac 1 pipe:1");

    const updates = lastValueFrom(service.events(id).pipe(toArray()));
    await service.write(id, Buffer.from("aa"));
    await service.write(id, Buffer.from("bb"));
    proc().stdin.once("finish", () => {
      proc().stdout.write(speech());
      proc().exit(0);
    });

    await expect(service.finish(id)).resolves.toBe("ahoj");
    expect(Buffer.concat(proc().written).toString()).toBe("aabb");
    expect(transcribePcm).toHaveBeenCalledWith(expect.any(Buffer), "en");
    expect((await updates).at(-1)).toEqual({ text: "ahoj", final: true });
    // Gone afterwards.
    await expect(service.write(id, Buffer.from("x"))).rejects.toBeInstanceOf(
      DictationSessionNotFoundError,
    );
  });

  it("unknown ids are not found", async () => {
    await expect(service.write("nope", Buffer.from("x"))).rejects.toBeInstanceOf(
      DictationSessionNotFoundError,
    );
    expect(() => service.events("nope")).toThrow(DictationSessionNotFoundError);
    await expect(service.finish("nope")).rejects.toBeInstanceOf(DictationSessionNotFoundError);
  });

  it("an ffmpeg that exits non-zero with no PCM is a decode error, and the session is destroyed", async () => {
    const { id } = await service.create({ mimeType: "audio/webm" });
    await service.write(id, Buffer.from("garbage"));
    proc().stdin.once("finish", () => proc().exit(1));
    await expect(service.finish(id)).rejects.toBeInstanceOf(SttTranscriptionError);
    expect(transcribePcm).not.toHaveBeenCalled();
    expect(() => service.events(id)).toThrow(DictationSessionNotFoundError);
  });

  it("a transcription failure in finish propagates and still destroys the session", async () => {
    transcribePcm.mockRejectedValue(new SttUnavailableError("Hex quit"));
    const { id } = await service.create({ mimeType: "audio/webm" });
    proc().stdin.once("finish", () => {
      proc().stdout.write(speech());
      proc().exit(0);
    });
    await expect(service.finish(id)).rejects.toBeInstanceOf(SttUnavailableError);
    expect(() => service.events(id)).toThrow(DictationSessionNotFoundError);
  });

  it("an idle session is destroyed: ffmpeg killed, stream completed, id forgotten", async () => {
    vi.useFakeTimers();
    const { id } = await service.create({ mimeType: "audio/webm" });
    const completed = vi.fn();
    service.events(id).subscribe({ complete: completed });

    vi.advanceTimersByTime(DICTATION_IDLE_MS - 1);
    await service.write(id, Buffer.from("x")); // resets the idle clock
    vi.advanceTimersByTime(DICTATION_IDLE_MS - 1);
    expect(proc().kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(proc().kill).toHaveBeenCalledWith("SIGKILL");
    expect(completed).toHaveBeenCalled();
    await expect(service.write(id, Buffer.from("x"))).rejects.toBeInstanceOf(
      DictationSessionNotFoundError,
    );
  });

  it("onModuleDestroy kills every ffmpeg and completes every stream", async () => {
    const a = await service.create({ mimeType: "audio/webm" });
    const b = await service.create({ mimeType: "audio/webm" });
    const completed = vi.fn();
    service.events(a.id).subscribe({ complete: completed });
    service.events(b.id).subscribe({ complete: completed });

    service.onModuleDestroy();
    expect(proc(0).kill).toHaveBeenCalled();
    expect(proc(1).kill).toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(2);
  });
});
