import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRunnerService } from "../src/agents/agent-runner.service";
import { AppModule } from "../src/app.module";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

const ENV_KEYS = [
  "AGENTS_DIR",
  "PIPELINES_DIR",
  "AGENT_RUNS_DIR",
  "TASKS_DIR",
  "PROJECTS_DIR",
  "APPROVALS_DIR",
  "BUDGET_LEDGER_DIR",
  "BUDGET_CONFIG_FILE",
  "ACTIVITY_DIR",
  "CLAUDE_BIN",
  "FAKE_CLAUDE_STEPS",
  "FAKE_CLAUDE_DELAY_MS",
] as const;

/**
 * Phase 8.2 engagement isolation & parallelism, end to end (the roadmap's stress
 * test). Project A caps `maxConcurrent: 1`; firing two tasks at A and one at B in
 * quick succession queues A's second task (no approval), runs B immediately, and
 * drains A's queue the moment A's first run reaches a terminal state. Each run keeps
 * its own run dir; the ledger and activity attribute every line to the right project.
 */
describe("Parallel engagements (e2e)", () => {
  let app: INestApplication;
  const dirs: Record<string, string> = {};

  const server = () => app.getHttpServer();

  const poll = async <T>(fn: () => Promise<T>, pred: (v: T) => boolean, tries = 80): Promise<T> => {
    for (let i = 0; i < tries; i++) {
      const v = await fn();
      if (pred(v)) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return fn();
  };

  const taskById = async (id: string) => {
    const res = await request(server()).get("/api/tasks/scheduled");
    return (res.body as Array<{ id: string; status: string; projectId?: string }>).find(
      (t) => t.id === id,
    );
  };

  const budgetRow = async (projectId: string) => {
    const res = await request(server()).get("/api/budget");
    return (
      res.body.projects as Array<{
        projectId: string;
        queued: number;
        running: number;
        daily: { used: number };
      }>
    ).find((p) => p.projectId === projectId);
  };

  beforeAll(async () => {
    for (const key of [
      "agents",
      "pipelines",
      "runs",
      "tasks",
      "projects",
      "approvals",
      "ledger",
      "activity",
      "pa",
      "pb",
    ]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `par-${key}-`));
    }
    process.env.AGENTS_DIR = dirs.agents;
    process.env.PIPELINES_DIR = dirs.pipelines;
    process.env.AGENT_RUNS_DIR = dirs.runs;
    process.env.TASKS_DIR = dirs.tasks;
    process.env.PROJECTS_DIR = dirs.projects;
    process.env.APPROVALS_DIR = dirs.approvals;
    process.env.BUDGET_LEDGER_DIR = dirs.ledger;
    process.env.BUDGET_CONFIG_FILE = path.join(dirs.ledger!, "budget.json");
    process.env.ACTIVITY_DIR = dirs.activity;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    // Long enough that A's first run is reliably still running when A's second
    // task is posted (queue trigger), short enough to keep the test snappy.
    process.env.FAKE_CLAUDE_STEPS = "6";
    process.env.FAKE_CLAUDE_DELAY_MS = "90";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(server()).post("/api/agents").send({
      id: "coder",
      name: "Coder",
      category: "Dev",
      description: "Implements fixes",
      instructions: "Write code.",
      ownerSubsystem: "forge",
    });
    await request(server())
      .post("/api/projects")
      .send({
        id: "alpha",
        name: "Alpha",
        path: dirs.pa,
        budget: { maxConcurrent: 1 },
      });
    await request(server())
      .post("/api/projects")
      .send({
        id: "beta",
        name: "Beta",
        path: dirs.pb,
        budget: { maxConcurrent: 5 },
      });
  });

  afterAll(async () => {
    await app.close();
    for (const dir of Object.values(dirs)) await fs.rm(dir, { recursive: true, force: true });
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("queues A's second task at maxConcurrent, runs B immediately, and drains the queue on terminal", async () => {
    // A's first task dispatches (occupies A's single slot). POST returns `pending`
    // (background dispatch) — wait for the record to land before the next create.
    const a1 = await request(server()).post("/api/tasks").send({ text: "alpha first job" });
    const a1Task = await poll(
      () => taskById(a1.body.task.id as string),
      (t) => t?.status === "dispatched",
    );
    expect(a1Task?.projectId).toBe("alpha");

    // A's second task — A is at capacity → queued (FIFO, no approval).
    const a2 = await request(server()).post("/api/tasks").send({ text: "alpha second job" });
    const a2Id = a2.body.task.id as string;
    const a2Task = await poll(
      () => taskById(a2Id),
      (t) => t?.status === "queued",
    );
    expect(a2Task?.status).toBe("queued");
    expect(a2Task?.projectId).toBe("alpha");

    // B's task runs immediately — a different engagement, its own slot.
    const b1 = await request(server()).post("/api/tasks").send({ text: "beta first job" });
    const b1Task = await poll(
      () => taskById(b1.body.task.id as string),
      (t) => t?.status === "dispatched",
    );
    expect(b1Task?.projectId).toBe("beta");

    // The budget readout shows A with one queued task.
    expect((await budgetRow("alpha"))?.queued).toBe(1);

    // A's first run reaches a terminal state → the queue drains → A2 dispatches.
    const drained = await poll(
      () => taskById(a2Id),
      (t) => t?.status === "dispatched",
    );
    expect(drained?.status).toBe("dispatched");

    // The ledger attributed both A runs and the B run to the right engagement.
    const alpha = await poll(
      () => budgetRow("alpha"),
      (r) => (r?.daily.used ?? 0) >= 2,
    );
    expect(alpha?.daily.used).toBe(2);
    expect(alpha?.queued).toBe(0);
    expect((await budgetRow("beta"))?.daily.used).toBe(1);
  });

  it("keeps each run in its own run dir (no checkout collision)", async () => {
    const runs = await app.get(AgentRunnerService).listAll();
    const cwds = runs.map((r) => r.cwd);
    expect(new Set(cwds).size).toBe(cwds.length); // all distinct
  });
});
