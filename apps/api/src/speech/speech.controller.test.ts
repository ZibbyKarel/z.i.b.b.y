import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SpeakdDaemonError, SpeakdTimeoutError, SpeakdUnreachableError } from "./speech.errors";
import { SpeechController } from "./speech.controller";
import { SpeechService } from "./speech.service";

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SpeechController],
      providers: [{ provide: SpeechService, useValue: { synthesize, listVoices, status } }],
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
    synthesize.mockRejectedValue(new SpeakdDaemonError(422, "invalid_request", "speed must be > 0"));
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
      { id: "cs-male-01", label: "Czech male", language: "cs", gender: "male", source: "x", license: "CC0-1.0" },
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
});
