import errorInvalidRequest from "./fixtures/error-invalid-request.json";
import errorNotReady from "./fixtures/error-not-ready.json";
import errorQueueFull from "./fixtures/error-queue-full.json";
import errorUnknownVoice from "./fixtures/error-unknown-voice.json";
import status from "./fixtures/status.json";
import voices from "./fixtures/voices.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpeakdDaemonError } from "./speech.errors";
import { SpeechService } from "./speech.service";

/**
 * Drift tripwire (whisper's D-0013 pattern, ARCHITECTURE §6): these JSON files are
 * committed snapshots of real `speakd` (`~/Workspace/tts`) response shapes, NOT
 * generated from the daemon's source at build time — there is no compile-time link
 * between the two repos. If speakd's wire shape ever changes, these fixtures go
 * stale silently; this test is the only thing that will notice, and only when it is
 * re-run against updated fixtures. Update the JSON files by hand alongside any
 * observed change in speakd's ARCHITECTURE.md §3.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpeechService against speakd fixtures", () => {
  it("parses the GET /v1/status fixture into the camelCase SpeechStatus mirror", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(status)));
    const result = await new SpeechService().status();
    expect(result).toEqual({
      reachable: true,
      state: "ready",
      engine: "ChatterboxEngine",
      model: "Thomcles/Chatterbox-TTS-Czech",
      device: "mps",
      defaultVoice: "cs-male-01",
      queueDepth: 0,
      uptimeS: 1234.5,
    });
  });

  it("parses the GET /v1/voices fixture unchanged, field-for-field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(voices)));
    const result = await new SpeechService().listVoices();
    expect(result).toEqual(voices);
  });

  it("decodes the queue_full error fixture (409) into a typed SpeakdDaemonError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(errorQueueFull, 409)));
    const err = await new SpeechService()
      .synthesize({ text: "ahoj", language: "cs" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(409);
    expect((err as SpeakdDaemonError).code).toBe("queue_full");
  });

  it("decodes the not_ready error fixture (503 while loading)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(errorNotReady, 503)));
    const err = await new SpeechService()
      .synthesize({ text: "ahoj", language: "cs" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(503);
    expect((err as SpeakdDaemonError).code).toBe("not_ready");
  });

  it("decodes the invalid_request error fixture (422)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(errorInvalidRequest, 422)));
    const err = await new SpeechService()
      .synthesize({ text: "ahoj", language: "cs", speed: -1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(422);
    expect((err as SpeakdDaemonError).code).toBe("invalid_request");
  });

  it("decodes the unknown_voice error fixture (400)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(errorUnknownVoice, 400)));
    const err = await new SpeechService()
      .synthesize({ text: "ahoj", voice: "nonexistent", language: "cs" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpeakdDaemonError);
    expect((err as SpeakdDaemonError).status).toBe(400);
    expect((err as SpeakdDaemonError).code).toBe("unknown_voice");
  });
});
