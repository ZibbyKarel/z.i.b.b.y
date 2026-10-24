import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectHealthController } from "./project-health.controller";
import {
  ProjectHealthConflictError,
  ProjectHealthDispatchError,
  ProjectHealthNotFoundError,
  ProjectHealthWatcherService,
} from "./project-health-watcher.service";

describe("ProjectHealthController — analyze status mapping", () => {
  let app: INestApplication;
  const watcher = { analyze: vi.fn(), checkNow: vi.fn(), list: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectHealthController],
      providers: [{ provide: ProjectHealthWatcherService, useValue: watcher }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
  });

  const analyze = () =>
    request(app.getHttpServer()).post("/api/project-health/acme/analyze").send({});

  it("200 with the created task id", async () => {
    watcher.analyze.mockResolvedValue({ taskId: "task_1" });
    const res = await analyze();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ taskId: "task_1" });
  });

  it("404 / 409 for NotFound / Conflict", async () => {
    watcher.analyze.mockRejectedValueOnce(new ProjectHealthNotFoundError("acme"));
    expect((await analyze()).status).toBe(404);
    watcher.analyze.mockRejectedValueOnce(new ProjectHealthConflictError("acme"));
    expect((await analyze()).status).toBe(409);
  });

  it("a createTask failure → 503 { message }, not 500", async () => {
    watcher.analyze.mockRejectedValueOnce(
      new ProjectHealthDispatchError("acme", new Error("catalog is empty")),
    );
    const res = await analyze();
    expect(res.status).toBe(503);
    expect(res.body.message).toContain("catalog is empty");
  });

  it("list delegates to the watcher's filtered list", async () => {
    watcher.list.mockResolvedValue([]);
    const res = await request(app.getHttpServer()).get("/api/project-health?projectId=acme");
    expect(res.status).toBe(200);
    expect(watcher.list).toHaveBeenCalledWith({ projectId: "acme" });
  });
});
