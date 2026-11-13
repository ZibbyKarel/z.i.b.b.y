import { type Server, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { of } from "rxjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DictationSessionNotFoundError, DictationStreamService } from "./dictation-stream.service";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";
import { SpeechController } from "./speech.controller";
import { SpeechService } from "./speech.service";
import { SttService, SttTranscriptionError, SttUnavailableError } from "./stt.service";

/**
 * Controller-level error mapping for `speechContract` (see its doc comment for the
 * status-code rationale). `SpeechService` is fully stubbed — this suite only
 * exercises `SpeechController`'s translation of typed service errors to HTTP status.
 */
describe("SpeechController", () => {
  let app: INestApplication;
  const synthesize = vi.fn();
  const listVoices = vi.fn();
  const status = vi.fn();
  const transcribe = vi.fn();
  const sttStatus = vi.fn();
  const dictation = { create: vi.fn(), write: vi.fn(), finish: vi.fn(), events: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SpeechController],
      providers: [
        { provide: SpeechService, useValue: { synthesize, listVoices, status } },
        { provide: SttService, useValue: { transcribe, status: sttStatus } },
        { provide: DictationStreamService, useValue: dictation },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    synthesize.mockReset();
    listVoices.mockReset();
    status.mockReset();
    transcribe.mockReset();
    sttStatus.mockReset();
    for (const fn of Object.values(dictation)) fn.mockReset();
  });

  it("200s a successful synthesize with the service's result verbatim", async () => {
    synthesize.mockResolvedValue({
      audioBase64: "UklGRg==",
      format: "wav",
      audioMs: 500,
      synthMs: 20,
      voice: "cs-male-01",
    });
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      audioBase64: "UklGRg==",
      format: "wav",
      audioMs: 500,
      synthMs: 20,
      voice: "cs-male-01",
    });
  });

  it("maps SpeakdUnreachableError to 503", async () => {
    synthesize.mockRejectedValue(new SpeakdUnreachableError("ECONNREFUSED"));
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(503);
  });

  it("maps SpeakdTimeoutError to 503", async () => {
    synthesize.mockRejectedValue(new SpeakdTimeoutError(30_000));
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(503);
  });

  it("passes through a daemon 409 (queue_full) as 409", async () => {
    synthesize.mockRejectedValue(new SpeakdDaemonError(409, "queue_full", "synth queue is full"));
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("synth queue is full");
  });

  it("passes through a daemon 422 (invalid request) as 422", async () => {
    synthesize.mockRejectedValue(
      new SpeakdDaemonError(422, "invalid_request", "speed must be > 0"),
    );
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(422);
  });

  it("passes through a daemon 400 (unknown voice) as 400", async () => {
    synthesize.mockRejectedValue(new SpeakdDaemonError(400, "unknown_voice", "unknown voice id"));
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", voice: "nope", language: "cs" });
    expect(res.status).toBe(400);
  });

  it("folds a daemon 503 (loading) to 503", async () => {
    synthesize.mockRejectedValue(new SpeakdDaemonError(503, "not_ready", "engine is not ready"));
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "ahoj", language: "cs" });
    expect(res.status).toBe(503);
  });

  it("rejects an empty text body with 400 (zod min(1) validation)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/speech/synthesize")
      .send({ text: "", language: "cs" });
    expect(res.status).toBe(400);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("200s listVoices with the service's array", async () => {
    listVoices.mockResolvedValue([
      {
        id: "cs-male-01",
        label: "Czech male",
        language: "cs",
        gender: "male",
        source: "x",
        license: "CC0-1.0",
      },
    ]);
    const res = await request(app.getHttpServer()).get("/api/speech/voices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("maps a listVoices daemon failure to 503", async () => {
    listVoices.mockRejectedValue(new SpeakdUnreachableError("ECONNREFUSED"));
    const res = await request(app.getHttpServer()).get("/api/speech/voices");
    expect(res.status).toBe(503);
  });

  it("always 200s getStatus (the service itself never throws)", async () => {
    status.mockResolvedValue({
      reachable: false,
      state: "degraded",
      engine: null,
      model: null,
      device: null,
      defaultVoice: null,
      queueDepth: null,
      uptimeS: null,
    });
    const res = await request(app.getHttpServer()).get("/api/speech/status");
    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(false);
  });

  const clip = { audioBase64: "AAAA", mimeType: "audio/webm" };

  it("200s a transcription", async () => {
    transcribe.mockResolvedValue({ text: "ahoj" });
    const res = await request(app.getHttpServer()).post("/api/speech/transcribe").send(clip);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "ahoj" });
  });

  it("maps SttUnavailableError to 503 and SttTranscriptionError to 422", async () => {
    transcribe.mockRejectedValueOnce(new SttUnavailableError("no model"));
    const unavailable = await request(app.getHttpServer())
      .post("/api/speech/transcribe")
      .send(clip);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.message).toContain("no model");

    transcribe.mockRejectedValueOnce(new SttTranscriptionError("bad audio"));
    const bad = await request(app.getHttpServer()).post("/api/speech/transcribe").send(clip);
    expect(bad.status).toBe(422);
  });

  it("merges the stt block into /speech/status", async () => {
    status.mockResolvedValue({
      reachable: false,
      state: "degraded",
      engine: null,
      model: null,
      device: null,
      defaultVoice: null,
      queueDepth: null,
      uptimeS: null,
    });
    sttStatus.mockResolvedValue({ available: false, reason: "no model" });
    const res = await request(app.getHttpServer()).get("/api/speech/status");
    expect(res.status).toBe(200);
    expect(res.body.stt).toEqual({ available: false, reason: "no model" });
    expect(res.body.reachable).toBe(false);
  });

  describe("dictation sessions", () => {
    const missing = (id: string) => {
      throw new DictationSessionNotFoundError(id);
    };

    it("201s a new session, 503s when STT is unavailable", async () => {
      dictation.create.mockResolvedValueOnce({ id: "s1" });
      const ok = await request(app.getHttpServer())
        .post("/api/speech/dictation")
        .send({ mimeType: "audio/webm", language: "cs" });
      expect(ok.status).toBe(201);
      expect(ok.body).toEqual({ id: "s1" });
      expect(dictation.create).toHaveBeenCalledWith({ mimeType: "audio/webm", language: "cs" });

      dictation.create.mockRejectedValueOnce(new SttUnavailableError("Hex is not running"));
      const down = await request(app.getHttpServer())
        .post("/api/speech/dictation")
        .send({ mimeType: "audio/webm" });
      expect(down.status).toBe(503);
    });

    it("finish: 200 text, 404 unknown, 422 undecodable, 503 unavailable", async () => {
      const finish = () => request(app.getHttpServer()).post("/api/speech/dictation/s1/finish");
      dictation.finish.mockResolvedValueOnce("ahoj světe");
      const ok = await finish();
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ text: "ahoj světe" });
      expect(dictation.finish).toHaveBeenCalledWith("s1");

      dictation.finish.mockRejectedValueOnce(new DictationSessionNotFoundError("s1"));
      expect((await finish()).status).toBe(404);
      dictation.finish.mockRejectedValueOnce(new SttTranscriptionError("could not decode"));
      expect((await finish()).status).toBe(422);
      dictation.finish.mockRejectedValueOnce(new SttUnavailableError("Hex quit"));
      expect((await finish()).status).toBe(503);
    });

    it("audio: 204 and writes the raw bytes, 404 unknown session, 413 over 1 MB", async () => {
      dictation.events.mockReturnValue(of());
      dictation.write.mockResolvedValue(undefined);
      const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0xff]);
      const ok = await request(app.getHttpServer())
        .post("/api/speech/dictation/s1/audio")
        .set("content-type", "application/octet-stream")
        .send(bytes);
      expect(ok.status).toBe(204);
      expect(dictation.write).toHaveBeenCalledWith("s1", bytes);

      // Headers only: the server must refuse on Content-Length without reading the body
      // (supertest would EPIPE writing the rest of an upload the server already rejected).
      const server = app.getHttpServer().listen(0) as Server;
      const { port } = server.address() as AddressInfo;
      const tooBig = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest(
          {
            port,
            method: "POST",
            path: "/api/speech/dictation/s1/audio",
            headers: {
              "content-type": "application/octet-stream",
              "content-length": 1024 * 1024 + 1,
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
            req.destroy();
          },
        );
        req.on("error", reject);
        req.flushHeaders();
      });
      server.close();
      expect(tooBig).toBe(413);
      expect(dictation.write).toHaveBeenCalledTimes(1);

      dictation.events.mockImplementation(missing);
      const unknown = await request(app.getHttpServer())
        .post("/api/speech/dictation/nope/audio")
        .set("content-type", "application/octet-stream")
        .send(bytes);
      expect(unknown.status).toBe(404);
    });

    it("events: streams {text, final} as SSE data and ends after the final update; 404 unknown", async () => {
      dictation.events.mockReturnValueOnce(
        of({ text: "ahoj", final: false }, { text: "ahoj světe", final: true }),
      );
      const res = await request(app.getHttpServer())
        .get("/api/speech/dictation/s1/events")
        .buffer(true)
        .parse((response, done) => {
          let text = "";
          response.on("data", (chunk: Buffer) => (text += chunk.toString()));
          response.on("end", () => done(null, text));
        });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");
      expect(res.body).toContain('data: {"text":"ahoj","final":false}');
      expect(res.body).toContain('data: {"text":"ahoj světe","final":true}');

      dictation.events.mockImplementationOnce(missing);
      expect(
        (await request(app.getHttpServer()).get("/api/speech/dictation/x/events")).status,
      ).toBe(404);
    });
  });
});
