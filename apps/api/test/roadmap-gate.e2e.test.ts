import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/**
 * 125e — the play/override/restart/resume routes + the dependency gate, exercised
 * end to end. `AGENTS_DIR`/`PIPELINES_DIR` are fresh+empty so a play always routes
 * to the orchestrator deterministically (same posture as `tasks.e2e.test.ts`'s
 * "unmatched task" case) — this test is about the GATE's own wiring (lifecycle
 * transitions, status codes, dependency ordering), not classification.
 */
describe("Roadmap gate API (e2e)", () => {
  let app: INestApplication;
  let roadmapDir: string;
  let projectsDir: string;
  let agentsDir: string;
  let pipelinesDir: string;
  let tasksDir: string;
  let projectPath: string;
  const projectId = "acme";

  beforeAll(async () => {
    roadmapDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-projects-"));
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-agents-"));
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-pipelines-"));
    tasksDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-tasks-"));
    // A real (but non-git) directory — `ProjectLocalService.resolveForRun` degrades
    // to sandbox-only for a non-git path, so dispatch never needs a real remote.
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-e2e-repo-"));
    process.env.ROADMAP_DIR = roadmapDir;
    process.env.PROJECTS_DIR = projectsDir;
    process.env.AGENTS_DIR = agentsDir;
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.TASKS_DIR = tasksDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: projectId, name: "Acme", path: projectPath })
      .expect(201);

    // A completely EMPTY catalog makes `createTask` throw `EmptyCatalogError` even
    // for the orchestrator fallback (nothing to be "low confidence" against) — one
    // deliberately unrelated agent is enough to give the classifier a real (if
    // unmatched) catalog, so every play deterministically falls through to the
    // orchestrator, same posture as `tasks.e2e.test.ts`'s `seedCatalog`.
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "unrelated-agent",
      name: "Unrelated",
      category: "Jiné",
      description: "Nesouvisí s roadmapem",
      instructions: "Dělej něco úplně jiného.",
      ownerSubsystem: "forge",
    });

    // 125g — the decomposition dispatch's explicit target must resolve to a real
    // agent record (`AgentRunnerService.start` 404s on an unknown id otherwise).
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "roadmap-decomposer",
        name: "Roadmap Decomposer",
        category: "Roadmap",
        description: "Decomposes a childless epic into a JSON list of child tasks.",
        instructions: "Respond with an empty JSON array: []",
        ownerSubsystem: "forge",
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const dir of [roadmapDir, projectsDir, agentsDir, pipelinesDir, tasksDir, projectPath]) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    for (const k of ["ROADMAP_DIR", "PROJECTS_DIR", "AGENTS_DIR", "PIPELINES_DIR", "TASKS_DIR"]) {
      delete process.env[k];
    }
  });

  async function createItem(over: Record<string, unknown> = {}): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items`)
      .send({ level: "task", name: "Rollout za flagem", description: "desc", ...over })
      .expect(201);
    return res.body.id as string;
  }

  async function createEpic(over: Record<string, unknown> = {}): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items`)
      .send({ level: "epic", name: "Epic", description: "desc", ...over })
      .expect(201);
    return res.body.id as string;
  }

  it("play on a ready item releases it immediately (running, a run is recorded)", async () => {
    const itemId = await createItem();

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/play`)
      .expect(200);

    expect(res.body.lifecycle).toBe("running");
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0].taskId).toBeTruthy();
  });

  it("play on a blocked item parks it in enqueued — no task is dispatched", async () => {
    const blockerId = await createItem({ name: "Blocker" });
    const itemId = await createItem({ name: "Blocked", dependsOn: [blockerId] });

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/play`)
      .expect(200);

    expect(res.body.lifecycle).toBe("enqueued");
    expect(res.body.enqueuedAt).toBeTruthy();
  });

  it("play 404s on an unknown item", async () => {
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/nonexistent/play`)
      .expect(404);
  });

  it("play 409s when the item is already in flight", async () => {
    const itemId = await createItem();
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/play`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/play`)
      .expect(409);
  });

  it("override releases a blocked-and-enqueued item immediately", async () => {
    const blockerId = await createItem({ name: "Blocker 2" });
    const itemId = await createItem({ name: "Blocked 2", dependsOn: [blockerId] });
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/play`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/override`)
      .send({ overrideBlocked: true })
      .expect(200);

    expect(res.body.overrideBlocked).toBe(true);
    expect(res.body.lifecycle).toBe("running");
  });

  it("bulk play enqueues every id in order and returns only the touched items", async () => {
    const a = await createItem({ name: "Bulk A" });
    const b = await createItem({ name: "Bulk B" });

    const res = await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/play`)
      .send({ itemIds: [a, b] })
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.every((i: { lifecycle: string }) => i.lifecycle === "running")).toBe(true);
  });

  it("restart 409s outside `failed`", async () => {
    const itemId = await createItem();
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/restart`)
      .expect(409);
  });

  it("resume 409s outside `failed`", async () => {
    const itemId = await createItem();
    await request(app.getHttpServer())
      .post(`/api/projects/${projectId}/roadmap/items/${itemId}/resume`)
      .expect(409);
  });

  describe("play on an epic (125g)", () => {
    it("with children — enqueues the todo children instead of the epic itself", async () => {
      const epicId = await createEpic({ name: "Epic with children" });
      const childId = await createItem({ name: "Child", parentId: epicId });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/roadmap/items/${epicId}/play`)
        .expect(200);

      expect(res.body.level).toBe("epic");
      expect(res.body.lifecycle).toBe("todo"); // an epic's own lifecycle never moves
      expect(res.body.runs).toHaveLength(0);

      const child = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/roadmap/items/${childId}`)
        .expect(200);
      expect(child.body.lifecycle).toBe("running");
    });

    it("childless — dispatches a decomposition run to the explicit roadmap-decomposer agent", async () => {
      const epicId = await createEpic({ name: "Childless epic" });

      const res = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/roadmap/items/${epicId}/play`)
        .expect(200);

      expect(res.body.lifecycle).toBe("todo");
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0].taskId).toBeTruthy();
      expect(res.body.runs[0].outcome).toBe("running");

      // Pressing play again while the decomposition run is in flight 409s — the
      // only in-flight guard an epic has, since its own lifecycle never gates it.
      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/roadmap/items/${epicId}/play`)
        .expect(409);
    });
  });
});
