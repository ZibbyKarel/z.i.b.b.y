import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import {
  SttService,
  SttTranscriptionError,
  SttUnavailableError,
  cleanTranscript,
} from "./stt.service";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: string | null;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => {
    child.exitCode = 0;
    child.emit("exit");
  });
  return child;
}

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
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "stt-"));
    writeFileSync(join(dir, "whisper-server"), "", { mode: 0o755 });
    writeFileSync(join(dir, "ffmpeg"), "", { mode: 0o755 });
    writeFileSync(join(dir, "model.bin"), "");
    process.env.WHISPER_BIN = join(dir, "whisper-server");
    process.env.WHISPER_MODEL = join(dir, "model.bin");
    process.env.PATH = `${dir}:${process.env.PATH ?? ""}`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    spawnMock.mockReset();
    delete process.env.WHISPER_URL;
    delete process.env.WHISPER_BIN;
    delete process.env.WHISPER_MODEL;
  });

  it("reports unavailable with a reason when the model is missing", async () => {
    process.env.WHISPER_MODEL = join(dir, "nope.bin");
    const status = await new SttService().status();
    expect(status.available).toBe(false);
    expect(status.reason).toContain("model");
  });

  it("is available with binary, model and ffmpeg present, or with WHISPER_URL", async () => {
    expect(await new SttService().status()).toEqual({ available: true });
    process.env.WHISPER_BIN = join(dir, "missing");
    expect((await new SttService().status()).available).toBe(false);
    process.env.WHISPER_URL = "http://127.0.0.1:1";
    expect(await new SttService().status()).toEqual({ available: true });
  });

  it("transcribe throws SttUnavailableError (not a 500) when nothing is installed", async () => {
    process.env.WHISPER_MODEL = join(dir, "nope.bin");
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
  });

  it("posts to an external WHISPER_URL and cleans the text", async () => {
    process.env.WHISPER_URL = "http://whisper.test/";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("language")).toBe("cs");
      expect((form.get("file") as File).name).toBe("dictation.webm");
      return new Response(JSON.stringify({ text: " Dobrý den. [BLANK_AUDIO]\n" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new SttService().transcribe(clip);
    expect(result).toEqual({ text: "Dobrý den." });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://whisper.test/inference");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("maps a non-2xx answer to SttTranscriptionError and a network failure to SttUnavailableError", async () => {
    process.env.WHISPER_URL = "http://whisper.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 })),
    );
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttTranscriptionError);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(new SttService().transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
  });

  it("spawns lazily once, reuses the server, respawns after it died and kills on destroy", async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    spawnMock.mockImplementation(() => {
      const c = fakeChild();
      children.push(c);
      return c;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/inference")
          ? new Response(JSON.stringify({ text: "ok" }))
          : new Response("up"),
      ),
    );
    const service = new SttService();
    expect(spawnMock).not.toHaveBeenCalled();

    await Promise.all([service.transcribe(clip), service.transcribe(clip)]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(args).toEqual(expect.arrayContaining(["-l", "cs", "--convert", "127.0.0.1"]));
    // Temp WAVs must not land in the (possibly unwritable) cwd.
    expect(args[args.indexOf("--tmp-dir") + 1]).toBe(tmpdir());
    expect((spawnMock.mock.calls[0]?.[2] as { cwd: string }).cwd).toBe(tmpdir());

    await service.transcribe(clip);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    children[0]?.emit("exit");
    await service.transcribe(clip);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
    expect(children[1]?.kill).toHaveBeenCalled();
  });

  it("turns an async spawn error (e.g. EACCES) into SttUnavailableError instead of crashing", async () => {
    spawnMock.mockImplementation(() => {
      const c = fakeChild();
      setTimeout(() => c.emit("error", new Error("spawn EACCES")), 10);
      return c;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("refused");
      }),
    );
    await expect(new SttService().transcribe(clip)).rejects.toThrow(/EACCES/);
  });

  it("rejects a non-executable WHISPER_BIN as unavailable", async () => {
    chmodSync(join(dir, "whisper-server"), 0o644);
    expect((await new SttService().status()).available).toBe(false);
  });

  it("kills the hung server on a request failure so the next call respawns", async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    spawnMock.mockImplementation(() => {
      const c = fakeChild();
      children.push(c);
      return c;
    });
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (!url.endsWith("/inference")) return new Response("up");
        if (fail) throw new DOMException("timeout", "TimeoutError");
        return new Response(JSON.stringify({ text: "ok" }));
      }),
    );
    const service = new SttService();
    await expect(service.transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
    expect(children[0]?.kill).toHaveBeenCalled();
    fail = false;
    await expect(service.transcribe(clip)).resolves.toEqual({ text: "ok" });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("does not spawn once the module has been destroyed", async () => {
    const service = new SttService();
    service.onModuleDestroy();
    await expect(service.transcribe(clip)).rejects.toBeInstanceOf(SttUnavailableError);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
