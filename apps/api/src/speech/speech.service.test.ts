import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";
import { SpeechService } from "./speech.service";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPEAKD_URL;
  delete process.env.SPEAKD_TIMEOUT_MS;
  delete process.env.SPEAKD_TOKEN;
});

describe("SpeechService", () => {
  it("round-trips a WAV response to base64, incl. non-ASCII Czech text in the request", async () => {
    const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]); // "RIFF.."
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:8899/v1/speak");
      const body = JSON.parse(init.body as string) as { text: string; language: string };
      expect(body.text).toBe("Příliš žluťoučký kůň úpěl ďábelské ódy.");
      expect(body.language).toBe("cs");
      return new Response(wav, {
        status: 200,
        headers: { "x-speakd-synth-ms": "42.5", "x-speakd-audio-ms": "1000.0" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new SpeechService();
    const result = await service.synthesize({
      text: "Příliš žluťoučký kůň úpěl ďábelské ódy.",
      language: "cs",
    });

    expect(Buffer.from(result.audioBase64, "base64")).toEqual(wav);
    expect(result.format).toBe("wav");
    expect(result.synthMs).toBe(42.5);
    expect(result.audioMs).toBe(1000);
    expect(result.voice).toBeNull();
  });

  it("echoes back the requested voice id when one was given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(Buffer.from([0]), { status: 200 })),
    );
    const service = new SpeechService();
    const result = await service.synthesize({ text: "ahoj", voice: "cs-male-01", language: "cs" });
    expect(result.voice).toBe("cs-male-01");
  });

  it("maps a signal timeout to SpeakdTimeoutError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    const service = new SpeechService();
    await expect(service.synthesize({ text: "ahoj", language: "cs" })).rejects.toBeInstanceOf(
      SpeakdTimeoutError,
    );
  });

  it("maps a network-level fetch failure to SpeakdUnreachableError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const service = new SpeechService();
    await expect(service.synthesize({ text: "ahoj", language: "cs" })).rejects.toBeInstanceOf(
      SpeakdUnreachableError,
    );
  });

  it("decodes the daemon's 409 queue_full envelope into a typed SpeakdDaemonError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "queue_full", message: "synth queue is full, try again shortly" } },
          409,
        ),
      ),
    );
    const service = new SpeechService();
    const err = await service.synthesize({ text: "ahoj", language: "cs" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(409);
    expect((err as SpeakdDaemonError).code).toBe("queue_full");
  });

  it("falls back to a generic HTTP-status message when the error body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502 Bad Gateway</html>", { status: 502 })),
    );
    const service = new SpeechService();
    const err = await service.synthesize({ text: "ahoj", language: "cs" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(502);
    expect((err as Error).message).toContain("HTTP 502");
  });

  it("sends the bearer token when SPEAKD_TOKEN is set, and none when it isn't", async () => {
    process.env.SPEAKD_TOKEN = "secret";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret");
      return new Response(Buffer.from([0]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new SpeechService().synthesize({ text: "ahoj", language: "cs" });

    delete process.env.SPEAKD_TOKEN;
    const noAuthFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).authorization).toBeUndefined();
      return new Response(Buffer.from([0]), { status: 200 });
    });
    vi.stubGlobal("fetch", noAuthFetch);
    await new SpeechService().synthesize({ text: "ahoj", language: "cs" });
  });

  it("respects SPEAKD_URL when set", async () => {
    process.env.SPEAKD_URL = "http://127.0.0.1:9999";
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:9999/v1/voices");
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    await new SpeechService().listVoices();
  });

  it("listVoices rejects a daemon body that doesn't match the voice shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ id: "x" }])), // missing label/language/gender/source/license
    );
    const service = new SpeechService();
    await expect(service.listVoices()).rejects.toBeInstanceOf(SpeakdDaemonError);
  });

  it("status() never throws — resolves reachable:false when the daemon is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const service = new SpeechService();
    await expect(service.status()).resolves.toEqual({
      reachable: false,
      state: "degraded",
      engine: null,
      model: null,
      device: null,
      defaultVoice: null,
      queueDepth: null,
      uptimeS: null,
    });
  });
});
