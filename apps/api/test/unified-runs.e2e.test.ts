import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/**
 * Guards the run-surface unification (the Phase D hard delete): the per-kind run
 * HTTP routes are GONE — a run is started only by creating a task, and every run
 * operation lives under the unified `/api/tasks/runs/*`. This pins that the old
 * routes 404 so a future change can't silently resurrect the fragmented surface,
 * while the two catalog-liveness reads we deliberately kept still answer 200.
 */
describe("Unified run surface (Phase D guard)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("404s every deleted per-kind run route (start, history, detail, lifecycle)", async () => {
    const http = () => app.getHttpServer();
    // Direct-start routes are gone (you start a run only via POST /api/tasks).
    await request(http()).post("/api/agents/whoever/run").send({ prompt: "x" }).expect(404);
    await request(http()).post("/api/pipelines/whatever/run").send({ project: "" }).expect(404);
    await request(http()).post("/api/goals/whichever/run").send({}).expect(404);
    // Run-history / list routes are gone (the unified feed replaces them).
    await request(http()).get("/api/agents/runs").expect(404);
    await request(http()).get("/api/pipelines/run-history").expect(404);
    await request(http()).get("/api/goals/run-history").expect(404);
    // Per-kind run lifecycle routes are gone (they live on /api/tasks/runs now).
    await request(http()).get("/api/agents/runs/nope/logs").expect(404);
    await request(http()).post("/api/pipelines/runs/nope/resume").send({}).expect(404);
  });

  it("keeps the catalog-liveness reads (the only per-kind run endpoints that survive)", async () => {
    const running = await request(app.getHttpServer()).get("/api/agents/running").expect(200);
    expect(Array.isArray(running.body)).toBe(true);
    const pipelineRuns = await request(app.getHttpServer()).get("/api/pipelines/runs").expect(200);
    expect(Array.isArray(pipelineRuns.body)).toBe(true);
  });

  it("serves the unified feed at /api/tasks/runs", async () => {
    const feed = await request(app.getHttpServer()).get("/api/tasks/runs").expect(200);
    expect(Array.isArray(feed.body)).toBe(true);
  });
});
