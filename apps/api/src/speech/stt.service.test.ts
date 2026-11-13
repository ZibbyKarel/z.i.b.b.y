import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ExecCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  ffmpegMissing: { value: false },
}));
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
// The service also searches /opt/homebrew/bin and /usr/local/bin, so "no ffmpeg" can't be done via PATH alone.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: (path: string, mode?: number) =>
      mocks.ffmpegMissing.value && String(path).endsWith("ffmpeg")
        ? Promise.reject(new Error("ENOENT"))
        : actual.access(path, mode),
  };
});

import {
  SttService,
  SttTranscriptionError,
  SttUnavailableError,
  cleanTranscript,
} from "./stt.service";

const clip = {
  audioBase64: Buffer.from("abc").toString("base64"),
  mimeType: "audio/webm;codecs=opus",
};

describe("cleanTranscript", () => {
  it("strips bracketed non-speech tags and normalises whitespace", () => {
    expect(cleanTranscript(" [BLANK_AUDIO]\n")).toBe("");
    expect(cleanTranscript(" Dobrý den [Music]\n toto je test. ")).toBe("Dobrý den toto je test.");
  });
});

describe("SttService", () => {
  const savedEnv = { ...process.env };
  let hexDir: string;
  let binDir: string;

  const writeDiscovery = () =>
    writeFileSync(
      join(hexDir, "local-api.json"),
      JSON.stringify({ port: 4321, token: "fake-token", apiVersion: "2", pid: 1 }),
    );
  const stubFetch = (response: () => Promise<Response>) => {
    const fetchMock = vi.fn(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const ok = (transcript = "Dobrý den. [BLANK_AUDIO]") =>
    new Response(JSON.stringify({ durationMs: 10, transcript }));

  beforeEach(() => {
    hexDir = mkdtempSync(join(tmpdir(), "stt-hex-"));
    binDir = mkdtempSync(join(tmpdir(), "stt-bin-"));
    writeFileSync(join(binDir, "ffmpeg"), "");
    chmodSync(join(binDir, "ffmpeg"), 0o755);
    process.env.PATH = binDir;
    process.env.HEX_APPLICATION_SUPPORT_DIR = hexDir;
    delete process.env.HEX_MODEL;
    mocks.ffmpegMissing.value = false;
    // The service promisifies execFile, so honour the node-style callback; the last arg is the output path.
    mocks.execFile.mockImplementation(
      (_bin: string, args: string[], _opts: object, cb: ExecCallback) => {
        writeFile(args[args.length - 1] as string, "RIFFwav").then(
          () => cb(null, { stdout: "", stderr: "" }),
          (error: Error) => cb(error),
        );
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mocks.execFile.mockReset();
    process.env = { ...savedEnv };
    rmSync(hexDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  });

  it("status: unavailable without local-api.json, unavailable without ffmpeg, available with both", async () => {
    const missingHex = await new SttService().status();
    expect(missingHex.available).toBe(false);
    expect(missingHex.reason).toContain("Hex");

    writeDiscovery();
    mocks.ffmpegMissing.value = true;
    const missingFfmpeg = await new SttService().status();
    expect(missingFfmpeg.available).toBe(false);
    expect(missingFfmpeg.reason).toContain("ffmpeg");

    mocks.ffmpegMissing.value = false;
    expect(await new SttService().status()).toEqual({ available: true });
  });

  it("transcribe throws SttUnavailableError when Hex is not running", async () => {
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
  });

  it("posts the WAV to Hex with bearer token, model and language, and cleans the transcript", async () => {
    writeDiscovery();
    const fetchMock = stubFetch(async () => ok());
    const result = await new SttService().transcribe({ ...clip, language: "en" });
    expect(result).toEqual({ text: "Dobrý den." });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4321/transcriptions?model=parakeet_v3&language=en");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      authorization: "Bearer fake-token",
      "content-type": "audio/wav",
    });
  });

  it("defaults the language to cs and resolves the model: HEX_MODEL > settings.json > default", async () => {
    writeDiscovery();
    const fetchMock = stubFetch(async () => ok());
    const calledUrl = async () => {
      fetchMock.mockClear();
      await new SttService().transcribe(clip);
      return (fetchMock.mock.calls[0] as unknown as [string])[0];
    };

    expect(await calledUrl()).toContain("model=parakeet_v3&language=cs");
    writeFileSync(
      join(hexDir, "settings.json"),
      JSON.stringify({ transcription: { model: "from_settings" } }),
    );
    expect(await calledUrl()).toContain("model=from_settings");
    process.env.HEX_MODEL = "from_env";
    expect(await calledUrl()).toContain("model=from_env");
  });

  it("maps 400 to SttTranscriptionError, 401/503 and fetch failure to SttUnavailableError", async () => {
    writeDiscovery();
    const status = (code: number) =>
      stubFetch(
        async () => new Response(JSON.stringify({ code: "invalid-audio" }), { status: code }),
      );

    status(400);
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttTranscriptionError);
    status(401);
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
    status(503);
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
  });

  it("turns an ffmpeg failure into SttTranscriptionError without calling Hex", async () => {
    writeDiscovery();
    const fetchMock = stubFetch(async () => ok());
    mocks.execFile.mockImplementation(
      (_bin: string, _args: string[], _opts: object, cb: ExecCallback) =>
        cb(new Error("Invalid data found when processing input")),
    );
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttTranscriptionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
