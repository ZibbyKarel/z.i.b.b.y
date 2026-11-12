import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ProjectCiController } from "./project-ci.controller";
import { ProjectCiConflictError, ProjectCiService } from "./project-ci.service";

describe("ProjectCiController", () => {
  let app: INestApplication;
  const ci = { get: vi.fn(), fix: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectCiController],
      providers: [{ provide: ProjectCiService, useValue: ci }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
  });

  const fix = () => request(app.getHttpServer()).post("/api/project-ci/acme/fix").send({});

  it("get: 200 / 404", async () => {
    ci.get.mockResolvedValueOnce({
      projectId: "acme",
      provider: "none",
      state: "none",
      workflows: [],
      checkedAt: "2026-11-12T10:00:00.000Z",
    });
    expect((await request(app.getHttpServer()).get("/api/project-ci/acme")).status).toBe(200);
    ci.get.mockRejectedValueOnce(new ProjectNotFoundError("acme"));
    expect((await request(app.getHttpServer()).get("/api/project-ci/acme")).status).toBe(404);
  });

  it("fix: 201 / 409 / 422", async () => {
    ci.fix.mockResolvedValueOnce({ taskId: "task_1" });
    const ok = await fix();
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ taskId: "task_1" });
    ci.fix.mockRejectedValueOnce(new ProjectCiConflictError("green"));
    expect((await fix()).status).toBe(409);
    ci.fix.mockRejectedValueOnce(new NoGithubLinkError("acme"));
    expect((await fix()).status).toBe(422);
  });
});
