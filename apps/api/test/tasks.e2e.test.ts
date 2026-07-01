import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { TaskSchedulerService } from "../src/tasks/task-scheduler.service";

const CLASSIFY = "/api/tasks/classify";
const CREATE = "/api/tasks";
const SCHEDULED = "/api/tasks/scheduled";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

/**
 * Under the test runner the `claude -p` router self-disables (same guard as the
 * usage fetcher), so every request deterministically exercises the keyword-scorer
 * fallback — no live LLM, no quota burn.
 */
describe("Tasks API (e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let pipelinesDir: string;
  let runsDir: string;
  let tasksDir: string;
  let projectsDir: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-agents-e2e-"));
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-pipelines-e2e-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-runs-e2e-"));
    tasksDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-scheduled-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tasks-projects-e2e-"));
    process.env.AGENTS_DIR = agentsDir;
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.AGENT_RUNS_DIR = runsDir;
    process.env.TASKS_DIR = tasksDir;
    process.env.PROJECTS_DIR = projectsDir;
    // A dispatch spawns a run; use the stub instead of the real claude CLI.
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "30";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    for (const dir of [agentsDir, pipelinesDir, tasksDir, projectsDir]) {
      for (const entry of await fs.readdir(dir)) {
        await fs.rm(path.join(dir, entry), { force: true });
      }
    }
  });

  afterAll(async () => {
    await app.close();
    for (const dir of [agentsDir, pipelinesDir, runsDir, tasksDir, projectsDir]) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    for (const k of [
      "AGENTS_DIR",
      "PIPELINES_DIR",
      "AGENT_RUNS_DIR",
      "TASKS_DIR",
      "PROJECTS_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  /**
   * Poll the scheduled-tasks record until the background dispatch lands it in the
   * expected status (POST /api/tasks returns `pending` immediately; classify +
   * spawn happen off the response path).
   */
  const untilTaskStatus = (
    id: string,
    status: string,
  ): Promise<{
    id: string;
    status: string;
    runRef?: string;
    error?: string;
    target?: { kind: string; id?: string };
  }> =>
    until(async () => {
      const list = await request(app.getHttpServer()).get(SCHEDULED).expect(200);
      const found = list.body.find((t: { id: string }) => t.id === id);
      return found?.status === status ? found : null;
    });

  const seedCatalog = async () => {
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "curator",
      name: "Kurátor",
      category: "Média",
      description: "Třídí a popisuje média v knihovně",
      instructions: "Spravuj média.",
    });
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "coder",
      name: "Kodér",
      category: "Vývoj",
      description: "Implementuje funkce podle zadání",
      instructions: "Piš kód.",
    });
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "build-feature",
        name: "Build Feature",
        desc: "Spec, implementace, testy a docs",
        phases: [
          {
            id: "spec",
            agent: "coder",
            consumes: "task",
            produces: "design",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "Postav feature.",
      });
  };

  it("routes a matching task to the right agent with confidence and candidates", async () => {
    await seedCatalog();
    const res = await request(app.getHttpServer())
      .post(CLASSIFY)
      .send({ text: "Srovnej a popiš média v mé knihovně" });

    expect(res.status).toBe(200);
    expect(res.body.target.id).toBe("curator");
    expect(res.body.matchedTerms.length).toBeGreaterThan(0);
    expect(res.body.confidence).toBeGreaterThan(0.4);
    // Every stored target is offered for manual override (2 agents + 1 pipeline).
    expect(res.body.candidates).toHaveLength(3);
    expect(res.body.candidates.some((c: { kind: string }) => c.kind === "pipeline")).toBe(true);
  });

  it("routes to the orchestrator (low confidence) when nothing matches", async () => {
    await seedCatalog();
    const res = await request(app.getHttpServer()).post(CLASSIFY).send({ text: "qqq zzz xyzzy" });

    expect(res.status).toBe(200);
    expect(res.body.target.kind).toBe("orchestrator");
    expect(res.body.target.id).toBeUndefined();
    expect(res.body.target.name).toBeTruthy();
    expect(res.body.confidence).toBeLessThan(0.4);
    // The real catalog is still offered for a manual override.
    expect(res.body.candidates).toHaveLength(3);
  });

  it("returns 422 when the catalog is empty", async () => {
    const res = await request(app.getHttpServer()).post(CLASSIFY).send({ text: "do something" });

    expect(res.status).toBe(422);
  });

  it("rejects an empty task body (contract validation)", async () => {
    const res = await request(app.getHttpServer()).post(CLASSIFY).send({ text: "" });
    expect(res.status).toBe(400);
  });

  it("createTask with no scheduledAt returns a pending task and dispatches it in the background", async () => {
    await seedCatalog();
    const res = await request(app.getHttpServer())
      .post(CREATE)
      .send({ title: "Vault sync", text: "Srovnej a popiš média v mé knihovně" });

    // The interactive path returns at once with a `pending` task (the dialog
    // redirects to it); classify + spawn happen off the response path.
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("pending");
    expect(res.body.task.status).toBe("pending");

    const task = await untilTaskStatus(res.body.task.id, "dispatched");
    expect(task.target?.id).toBe("curator");
    expect(typeof task.runRef).toBe("string");

    // The dispatched agent run exists and carries the title through.
    const run = await request(app.getHttpServer()).get(`/api/tasks/runs/${task.runRef}`);
    expect(run.status).toBe(200);
    expect(run.body.title).toBe("Vault sync");
  });

  it("createTask with an unmatched task dispatches a run via the orchestrator", async () => {
    await seedCatalog();
    const res = await request(app.getHttpServer())
      .post(CREATE)
      .send({ title: "Mystery", text: "qqq zzz xyzzy" });

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("pending");
    const task = await untilTaskStatus(res.body.task.id, "dispatched");
    expect(task.target?.kind).toBe("orchestrator");
    expect(typeof task.runRef).toBe("string");

    // The orchestrator run is a normal agent-feed run under the reserved owner id.
    const run = await request(app.getHttpServer()).get(`/api/tasks/runs/${task.runRef}`);
    expect(run.status).toBe(200);
    expect(run.body.owner).toBe("orchestrator");
    expect(run.body.title).toBe("Mystery");
  });

  it("createTask with a future scheduledAt parks the task instead of dispatching", async () => {
    await seedCatalog();
    const scheduledAt = Date.now() + 60 * 60 * 1000;
    const res = await request(app.getHttpServer())
      .post(CREATE)
      .send({ text: "Srovnej a popiš média v mé knihovně", scheduledAt });

    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("scheduled");
    expect(res.body.task.status).toBe("scheduled");
    expect(res.body.task.scheduledAt).toBe(scheduledAt);

    // It shows up in the queue, and a future task is NOT fired by a tick yet.
    const list = await request(app.getHttpServer()).get(SCHEDULED).expect(200);
    expect(list.body.map((t: { id: string }) => t.id)).toContain(res.body.task.id);

    const scheduler = app.get(TaskSchedulerService);
    const firedEarly = await scheduler.tick(new Date(scheduledAt - 60_000));
    expect(firedEarly).not.toContain(res.body.task.id);
  });

  it("the scheduler tick fires a due task, dispatching its run", async () => {
    await seedCatalog();
    const scheduledAt = Date.now() + 60 * 60 * 1000;
    const created = await request(app.getHttpServer())
      .post(CREATE)
      .send({ text: "Srovnej a popiš média v mé knihovně", scheduledAt })
      .expect(201);
    const id = created.body.task.id;

    const scheduler = app.get(TaskSchedulerService);
    const fired = await scheduler.tick(new Date(scheduledAt + 1000));
    expect(fired).toContain(id);

    // The task is now marked dispatched with a real run reference.
    const list = await request(app.getHttpServer()).get(SCHEDULED).expect(200);
    const task = list.body.find((t: { id: string }) => t.id === id);
    expect(task.status).toBe("dispatched");
    expect(typeof task.runRef).toBe("string");
    await request(app.getHttpServer()).get(`/api/tasks/runs/${task.runRef}`).expect(200);
  });

  it("cancelling a scheduled task stops it from ever firing", async () => {
    await seedCatalog();
    const scheduledAt = Date.now() + 60 * 60 * 1000;
    const created = await request(app.getHttpServer())
      .post(CREATE)
      .send({ text: "Srovnej a popiš média v mé knihovně", scheduledAt })
      .expect(201);
    const id = created.body.task.id;

    const cancelled = await request(app.getHttpServer()).delete(`${SCHEDULED}/${id}`).expect(200);
    expect(cancelled.body.status).toBe("cancelled");

    const scheduler = app.get(TaskSchedulerService);
    const fired = await scheduler.tick(new Date(scheduledAt + 1000));
    expect(fired).not.toContain(id);
  });

  it("404s on cancelling an unknown scheduled task", async () => {
    await request(app.getHttpServer()).delete(`${SCHEDULED}/ghost`).expect(404);
  });

  it("createTask with an empty catalog flips the pending task to failed (never silent)", async () => {
    // The background path can't 422 on the response; the failure lands on the task
    // record with its reason, so the feed shows WHY nothing ran (Law 5).
    const res = await request(app.getHttpServer()).post(CREATE).send({ text: "do something now" });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe("pending");
    const task = await untilTaskStatus(res.body.task.id, "failed");
    expect(task.error).toContain("No agents or pipelines");
  });

  it("an immediate task is persisted, its run carries the taskId, and the outcome lands as done", async () => {
    await seedCatalog();
    const res = await request(app.getHttpServer())
      .post(CREATE)
      .send({ title: "Outcome check", text: "Srovnej a popiš média v mé knihovně" })
      .expect(201);
    expect(res.body.outcome).toBe("pending");
    const dispatched = await untilTaskStatus(res.body.task.id, "dispatched");
    expect(typeof dispatched.runRef).toBe("string");

    // The run was born linked to the task record.
    const run = await request(app.getHttpServer())
      .get(`/api/tasks/runs/${dispatched.runRef}`)
      .expect(200);
    expect(run.body.taskId).toBe(res.body.task.id);

    // Once the run finishes, the outcome is written back onto the task record.
    const task = await until(async () => {
      const list = await request(app.getHttpServer()).get(SCHEDULED).expect(200);
      const found = list.body.find((t: { id: string }) => t.id === res.body.task.id);
      return found?.outcome ? found : null;
    });
    expect(task.outcome.status).toBe("done");
    expect(typeof task.outcome.summary).toBe("string");
    expect(task.outcome.summary.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(task.outcome.finishedAt))).toBe(false);
  });

  it("a failing run writes outcome error onto its task", async () => {
    await seedCatalog();
    // The fixture exits non-zero right after starting → the run lands `error`.
    process.env.FAKE_CLAUDE_FAIL = "1";
    try {
      const res = await request(app.getHttpServer())
        .post(CREATE)
        .send({ title: "Doomed", text: "Srovnej a popiš média v mé knihovně" })
        .expect(201);

      const task = await until(async () => {
        const list = await request(app.getHttpServer()).get(SCHEDULED).expect(200);
        const found = list.body.find((t: { id: string }) => t.id === res.body.task.id);
        return found?.outcome ? found : null;
      });
      expect(task.outcome.status).toBe("error");
      expect(task.outcome.summary).toContain("Simulated failure");
    } finally {
      delete process.env.FAKE_CLAUDE_FAIL;
    }
  });

  // ── Phase 11 ────────────────────────────────────────────────────────────
  describe("Phase 11 — loop synthesis + path scoping", () => {
    it("classifies a loop-cued task to mode:loop with a checks verifier proposal", async () => {
      await seedCatalog();
      const res = await request(app.getHttpServer())
        .post(CLASSIFY)
        .send({ text: "implementuj feature a opakuj, dokud testy neprojdou" });

      expect(res.status).toBe(200);
      expect(res.body.mode).toBe("loop");
      expect(res.body.proposedGoal).toBeTruthy();
      expect(res.body.proposedGoal.verifier).toEqual({ kind: "checks" });
      expect(["agent", "pipeline"]).toContain(res.body.proposedGoal.maker.kind);
      // The target stays the maker — never a synthesized goal target (Decision 1).
      expect(res.body.target.kind).not.toBe("goal");
    });

    it("classify writes no goal files (side-effect-free preview)", async () => {
      await seedCatalog();
      const goalsBefore = await request(app.getHttpServer()).get("/api/goals").expect(200);
      await request(app.getHttpServer())
        .post(CLASSIFY)
        .send({ text: "fix the build and keep retrying until it passes" })
        .expect(200);
      const goalsAfter = await request(app.getHttpServer()).get("/api/goals").expect(200);
      expect(goalsAfter.body.length).toBe(goalsBefore.body.length);
    });

    it("resolves a granted folder's path to its project on a later classify", async () => {
      await seedCatalog();
      const folder = await fs.mkdtemp(path.join(os.tmpdir(), "granted-"));

      // Before the grant the path is unattributed.
      const before = await request(app.getHttpServer())
        .post(CLASSIFY)
        .send({ text: `tweak something`, paths: [`${folder}/src/x.ts`] })
        .expect(200);
      expect(before.body.paths[0].project).toBeNull();

      // The operator grants access (createProject) → the path now resolves.
      await request(app.getHttpServer())
        .post("/api/projects")
        .send({ id: "granted", name: "Granted", path: folder })
        .expect(201);
      const after = await request(app.getHttpServer())
        .post(CLASSIFY)
        .send({ text: `tweak something`, paths: [`${folder}/src/x.ts`] })
        .expect(200);
      expect(after.body.paths[0].project).toEqual({ id: "granted", name: "Granted" });

      await fs.rm(folder, { recursive: true, force: true });
    });

    it("dispatches a task against a non-git granted folder without a worktree error", async () => {
      await seedCatalog();
      const folder = await fs.mkdtemp(path.join(os.tmpdir(), "granted-nongit-"));
      await request(app.getHttpServer())
        .post("/api/projects")
        .send({ id: "nongit", name: "NonGit", path: folder })
        .expect(201);

      // A task whose path lands in the (non-git) granted folder must still run.
      const res = await request(app.getHttpServer())
        .post(CREATE)
        .send({ text: "Implementuj funkce podle zadání", paths: [`${folder}/feature.ts`] });

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("pending");
      const task = await untilTaskStatus(res.body.task.id, "dispatched");
      expect(typeof task.runRef).toBe("string");
      const run = await request(app.getHttpServer()).get(`/api/tasks/runs/${task.runRef}`);
      expect(run.status).toBe(200);
      // The run is attributed to the granted project (no WorkspaceSetupError thrown).
      expect(run.body.project).toBe("nongit");

      await fs.rm(folder, { recursive: true, force: true });
    });
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 8000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}
