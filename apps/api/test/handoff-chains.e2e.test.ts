import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { TaskSchedulerService } from "../src/tasks/task-scheduler.service";
import { seedEmployeeFixture } from "./fixtures/employee-fixture";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

async function until<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 20000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await new Promise((r) => setTimeout(r, 40));
  }
}

type Scheduled = {
  id: string;
  status: string;
  parentTaskId?: string;
  department?: string;
  chain?: { id: string; step: number };
  target?: { kind: string; id?: string };
  outcome?: { status: string };
};

const isDone = (t: Scheduled) => t.outcome?.status === "done";
const isErrored = (t: Scheduled) => t.status === "failed" || t.outcome?.status === "error";

/**
 * ZB-05a — end-to-end chain flow: a chain `rnd -> dev (auto) -> rel (ask)`,
 * dispatched via a "chain" task target. Covers deliverable 8's happy path
 * (parent linkage, tier-2 auto-advance, tier-3 approval-gated hop, parent
 * "done") plus idempotency (a duplicate chain-step emission never re-dispatches
 * — `HandoffFiredStore`'s fingerprint dedup, `${parentTaskId}:${step}`).
 */
describe("Handoff chains (e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let employeesDir: string;
  let tasksDir: string;
  let projectsDir: string;
  let runsDir: string;
  let pipelinesDir: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-agents-e2e-"));
    employeesDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-employees-e2e-"));
    tasksDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-tasks-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-projects-e2e-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-runs-e2e-"));
    // Isolated from the committed production "delivery" pipeline (owned by dev) —
    // otherwise dev has TWO owned units and department resolution prefers the
    // pipeline over the single seeded agent (see `tasks.e2e.test.ts`).
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-pipelines-e2e-"));
    process.env.AGENTS_DIR = agentsDir;
    process.env.EMPLOYEES_DIR = employeesDir;
    process.env.TASKS_DIR = tasksDir;
    process.env.PROJECTS_DIR = projectsDir;
    process.env.AGENT_RUNS_DIR = runsDir;
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "2";
    process.env.FAKE_CLAUDE_DELAY_MS = "30";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // One owned agent per department on the chain's route — a department
    // target's stage-2 resolve needs a single owned unit to dispatch to.
    for (const [id, name, department] of [
      ["rnd-agent", "Researcher", "rnd"],
      ["dev-agent", "Coder", "dev"],
      ["rel-agent", "Releaser", "rel"],
    ] as const) {
      await request(app.getHttpServer())
        .post("/api/agents")
        .send({
          id,
          name,
          category: "Test",
          description: `${name} test agent`,
          instructions: "Do the work.",
          department,
        });
      await seedEmployeeFixture(employeesDir, { id: `employee_${id}`, agentId: id, department });
    }
  });

  afterAll(async () => {
    await app.close();
    for (const dir of [agentsDir, employeesDir, tasksDir, projectsDir, runsDir, pipelinesDir]) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    for (const k of [
      "AGENTS_DIR",
      "EMPLOYEES_DIR",
      "TASKS_DIR",
      "PROJECTS_DIR",
      "AGENT_RUNS_DIR",
      "PIPELINES_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
    ]) {
      delete process.env[k];
    }
  });

  const server = () => app.getHttpServer();

  const scheduled = async (): Promise<Scheduled[]> =>
    (await request(server()).get("/api/tasks/scheduled").expect(200)).body;

  const subtaskFor = (all: Scheduled[], parentId: string, step: number) =>
    all.find((t) => t.parentTaskId === parentId && t.chain?.step === step);

  it("walks rnd -> dev (auto) -> rel (ask), then the parent settles done; a duplicate step emission never re-dispatches", async () => {
    await request(server())
      .put("/api/handoff/chains/rnd-dev-rel")
      .send({
        label: "Research to release",
        description: "rnd finds it, dev builds it, rel ships it.",
        entry: "rnd",
        steps: [
          { department: "dev", gate: "auto" },
          { department: "rel", gate: "ask" },
        ],
        enabled: true,
      })
      .expect(200);

    const created = await request(server())
      .post("/api/tasks")
      .send({
        title: "Chain e2e",
        text: "Walk the whole chain end to end.",
        target: { kind: "chain", id: "rnd-dev-rel", name: "Research to release" },
      })
      .expect(201);
    const parentId = created.body.task.id as string;

    // Step 0 — rnd (the entry): dispatched with no gate, parent linkage stamped.
    const rndTask = await until(async () => subtaskFor(await scheduled(), parentId, 0));
    expect(rndTask.parentTaskId).toBe(parentId);
    expect(rndTask.department).toBe("rnd");
    await until(async () => (await scheduled()).find((t) => t.id === rndTask.id && isDone(t)));

    // Step 1 — dev (auto/tier-2): auto-dispatched once rnd's completion fires the hop.
    const devTask = await until(async () => subtaskFor(await scheduled(), parentId, 1));
    expect(devTask.department).toBe("dev");
    await until(async () => (await scheduled()).find((t) => t.id === devTask.id && isDone(t)));

    // Step 2 — rel (ask/tier-3): parked behind a handoff-proposal approval, NOT
    // yet dispatched (Law 1 — an ASK hop never auto-advances).
    const approval = await until(async () => {
      const res = await request(server())
        .get("/api/approvals")
        .query({ status: "pending" })
        .expect(200);
      return (res.body as Array<{ id: string; kind: string }>).find(
        (a) => a.kind === "handoff-proposal",
      );
    });
    expect(subtaskFor(await scheduled(), parentId, 2)).toBeUndefined();

    // Idempotency: re-emitting dev's own chain-step completion must NOT create a
    // second proposal/dispatch for step 2 — the fingerprint `${parentId}:1` already
    // fired (`HandoffFiredStore`).
    await app.get(TaskSchedulerService).emitChainStep(devTask.id);
    const approvalsAfterReplay = await request(server())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200);
    expect(
      (approvalsAfterReplay.body as Array<{ kind: string }>).filter(
        (a) => a.kind === "handoff-proposal",
      ),
    ).toHaveLength(1);
    expect(subtaskFor(await scheduled(), parentId, 2)).toBeUndefined();

    // Approve — dispatches the final hop.
    await request(server()).post(`/api/approvals/${approval.id}/approve`).expect(200);
    const relTask = await until(async () => subtaskFor(await scheduled(), parentId, 2));
    expect(relTask.department).toBe("rel");
    await until(async () => (await scheduled()).find((t) => t.id === relTask.id && isDone(t)));

    // The chain has no further hop past rel — `chainEndedAt` gets stamped and the
    // parent settles "done" (TaskParentsService.deriveParentState).
    const parents = await until(async () => {
      const res = await request(server()).get("/api/tasks/parents").expect(200);
      const parent = (res.body.items as Array<{ id: string; state: string }>).find(
        (p) => p.id === parentId,
      );
      return parent?.state === "done" ? parent : null;
    });
    expect(parents.state).toBe("done");

    // Never more than one subtask per step — the whole walk stayed idempotent.
    const all = await scheduled();
    expect(all.filter((t) => t.parentTaskId === parentId)).toHaveLength(3);
  });

  it("a red step halts the chain and the parent shows error", async () => {
    process.env.FAKE_CLAUDE_FAIL = "1";
    try {
      await request(server())
        .put("/api/handoff/chains/red-entry")
        .send({
          label: "Red entry",
          description: "The entry step always fails.",
          entry: "dev",
          steps: [{ department: "rel", gate: "auto" }],
          enabled: true,
        })
        .expect(200);

      const created = await request(server())
        .post("/api/tasks")
        .send({
          title: "Red chain e2e",
          text: "This entry step is designed to fail.",
          target: { kind: "chain", id: "red-entry", name: "Red entry" },
        })
        .expect(201);
      const parentId = created.body.task.id as string;

      const entryTask = await until(async () => subtaskFor(await scheduled(), parentId, 0));
      await until(async () =>
        (await scheduled()).find((t) => t.id === entryTask.id && isErrored(t)),
      );

      const parent = await until(async () => {
        const res = await request(server()).get("/api/tasks/parents").expect(200);
        const found = (res.body.items as Array<{ id: string; state: string }>).find(
          (p) => p.id === parentId,
        );
        return found?.state === "error" ? found : null;
      });
      expect(parent.state).toBe("error");

      // No further hop is ever dispatched for an errored step — the chain halts here.
      expect(subtaskFor(await scheduled(), parentId, 1)).toBeUndefined();
    } finally {
      delete process.env.FAKE_CLAUDE_FAIL;
    }
  });
});
