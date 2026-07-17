import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * Phase 8.3 restart verification (decision 16) — the "machine that rebooted once"
 * exit criterion at the task layer. The same data dirs are re-booted into a fresh
 * Nest app; a HELD task survives and stays resumable via its approval, and a QUEUED
 * task drains on the bootstrap sweep once its blocking run is gone.
 */
describe("Budget restart (e2e)", () => {
  let app: INestApplication;
  const dirs: Record<string, string> = {};

  const server = () => app.getHttpServer();

  const boot = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  const reboot = async () => {
    await app.close();
    await boot();
  };

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
    return (res.body as Array<{ id: string; status: string; approvalId?: string }>).find(
      (t) => t.id === id,
    );
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
    ]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `bres-${key}-`));
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
    process.env.FAKE_CLAUDE_STEPS = "8";
    process.env.FAKE_CLAUDE_DELAY_MS = "90";

    await boot();
    await request(server()).post("/api/agents").send({
      id: "coder",
      name: "Coder",
      category: "Dev",
      description: "Implements fixes",
      instructions: "Write code.",
      ownerSubsystem: "forge",
    });
    // alpha: dailyRuns 1 drives the HOLD path. beta: maxConcurrent 1 only, so the
    // QUEUE path is exercised without the daily cap interfering.
    await request(server())
      .post("/api/projects")
      .send({
        id: "alpha",
        name: "Alpha",
        path: dirs.projects,
        budget: { dailyRuns: 1 },
      });
    await request(server())
      .post("/api/projects")
      .send({
        id: "beta",
        name: "Beta",
        path: dirs.projects,
        budget: { maxConcurrent: 1 },
      });
  });

  afterAll(async () => {
    await app.close();
    for (const dir of Object.values(dirs)) await fs.rm(dir, { recursive: true, force: true });
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("a held task survives a reboot and is still resumable via its approval", async () => {
    // First task consumes the daily cap. Dispatch happens off the response path
    // (POST returns `pending`) — wait for it so the second create reliably sees
    // the cap already spent.
    const filler = await request(server()).post("/api/tasks").send({ text: "alpha cap filler" });
    await poll(
      () => taskById(filler.body.task.id as string),
      (t) => t?.status === "dispatched",
    );
    // Second task is held over the daily cap (the hold too lands in the background).
    const held = await request(server()).post("/api/tasks").send({ text: "alpha held job" });
    const heldId = held.body.task.id as string;
    const heldTask = await poll(
      () => taskById(heldId),
      (t) => t?.status === "held",
    );
    expect(heldTask?.status).toBe("held");
    const approvalId = heldTask?.approvalId as string;

    await reboot();

    // The held task + its approval survived the restart.
    expect((await taskById(heldId))?.status).toBe("held");
    const pending = (await request(server()).get("/api/approvals?status=pending")).body as Array<{
      id: string;
    }>;
    expect(pending.some((a) => a.id === approvalId)).toBe(true);

    // Approving after the restart still dispatches it (kind-"task" runner re-registered).
    const approve = await request(server()).post(`/api/approvals/${approvalId}/approve`);
    expect(approve.status).toBe(200);
    const dispatched = await poll(
      () => taskById(heldId),
      (t) => t?.status === "dispatched",
    );
    expect(dispatched?.status).toBe("dispatched");
  });

  it("a queued task drains on the bootstrap sweep after its blocking run is gone", async () => {
    // beta caps concurrency at 1 (no daily cap): the blocker takes the slot, running
    // (dispatch lands in the background — wait for it so the next task queues).
    const blocker = await request(server()).post("/api/tasks").send({ text: "beta blocker run" });
    const blockerTask = await poll(
      () => taskById(blocker.body.task.id as string),
      (t) => t?.status === "dispatched",
    );
    expect(blockerTask?.status).toBe("dispatched");

    // The next beta task queues behind it.
    const queued = await request(server())
      .post("/api/tasks")
      .send({ text: "beta queued behind blocker" });
    const queuedId = queued.body.task.id as string;
    const queuedTask = await poll(
      () => taskById(queuedId),
      (t) => t?.status === "queued",
    );
    expect(queuedTask?.status).toBe("queued");

    // Reboot: the blocker's child dies with the API → on bootstrap the slot is free,
    // and the queue-drain sweep dispatches the waiting task.
    await reboot();
    const after = await poll(
      () => taskById(queuedId),
      (t) => t?.status === "dispatched",
    );
    expect(after?.status).toBe("dispatched");
  });
});
