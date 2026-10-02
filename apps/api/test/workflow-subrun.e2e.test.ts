import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ApprovalsService } from "../src/approvals/approvals.service";
import { WorkflowRunnerService } from "../src/workflows/workflow-runner.service";
import { defaultEmployeesDir, seedEmployeeFixture } from "./fixtures/employee-fixture";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T>, timeoutMs = 25000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: "writer",
  consumes: `${id}.in`,
  produces: `${id}.out`,
  model: "sonnet",
  thinking: "medium",
  ...extra,
});
const subPhase = (id: string, workflow: string) => ({
  id,
  type: "workflow",
  workflow,
  consumes: `${id}.in`,
  produces: `${id}.out`,
});

describe("Workflow sub-runs (e2e)", () => {
  let app: INestApplication;
  const dirs: string[] = [];

  beforeAll(async () => {
    for (const k of ["workflows", "runs", "projects", "vault"]) {
      dirs.push(await fs.mkdtemp(path.join(os.tmpdir(), `subrun-${k}-`)));
    }
    process.env.WORKFLOWS_DIR = dirs[0];
    process.env.WORKFLOW_RUNS_DIR = dirs[1];
    process.env.PROJECTS_DIR = dirs[2];
    process.env.VAULT_DIR = dirs[3];
    process.env.AGENT_DEMO_STEPS = "2";
    process.env.AGENT_DEMO_DELAY_MS = "30";
    await seedEmployeeFixture(defaultEmployeesDir(), {
      id: "employee_writer",
      agentId: "writer",
      department: "dev",
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const d of dirs) {
      await fs.rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
    for (const k of [
      "WORKFLOWS_DIR",
      "WORKFLOW_RUNS_DIR",
      "PROJECTS_DIR",
      "VAULT_DIR",
      "AGENT_DEMO_STEPS",
      "AGENT_DEMO_DELAY_MS",
      "WORKFLOW_DEMO_FAIL_PHASES",
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    delete process.env.WORKFLOW_DEMO_FAIL_PHASES;
  });

  const create = (id: string, phases: unknown[]) =>
    request(app.getHttpServer())
      .post("/api/workflows")
      .send({ id, phases, instructions: id, department: "dev" });

  const runner = () => app.get(WorkflowRunnerService);
  const settle = (id: string) =>
    until(async () => {
      const r = runner().get(id);
      return r.status !== "running" ? r : null;
    });
  const pendingGate = async (runId: string) => {
    const all = await app.get(ApprovalsService).list("pending");
    return all.find((a) => a.kind === "workflow-gate" && a.runId === runId) ?? null;
  };
  const childOf = (parentRunId: string) =>
    runner()
      .list()
      .find((r) => r.parentRunId === parentRunId);

  it("agent → workflow(child) → agent: the child's artifact flows through and the child is hidden from the feed", async () => {
    await create("sr-child", [phase("c1")]).expect(201);
    await create("sr-parent", [phase("a"), subPhase("sub", "sr-child"), phase("z")]).expect(201);

    const start = await runner().start("sr-parent", undefined, undefined);
    const final = await settle(start.workflowRunId);
    expect(final.status).toBe("done");
    expect(final.stageRuns.map((s) => s.phaseId)).toEqual(["a", "sub", "z"]);

    const stage = final.stageRuns[1];
    expect(stage?.childRunId).toBeTruthy();
    const child = runner().get(stage?.childRunId ?? "");
    expect(child.parentRunId).toBe(start.workflowRunId);
    expect(child.status).toBe("done");

    // The child's latest artifact is written into the parent stage as `produces`.
    const produced = await fs.readFile(path.join(final.cwd, stage?.dir ?? "", "sub.out"), "utf8");
    expect(produced).toContain("output of c1");
    // …and the next phase consumed it.
    const handoff = await fs.readFile(path.join(final.cwd, "03_z", "z.in"), "utf8");
    expect(handoff).toContain("output of c1");

    const feed = await request(app.getHttpServer()).get("/api/tasks/runs").expect(200);
    const ids = (feed.body as { runId: string }[]).map((r) => r.runId);
    expect(ids).toContain(start.workflowRunId);
    expect(ids).not.toContain(child.workflowRunId);
  });

  it("a failing child fails the parent without looping", async () => {
    process.env.WORKFLOW_DEMO_FAIL_PHASES = "boom";
    await create("sr-bad-child", [phase("boom")]).expect(201);
    await create("sr-bad-parent", [phase("a"), subPhase("sub", "sr-bad-child"), phase("z")]).expect(
      201,
    );

    const start = await runner().start("sr-bad-parent", undefined, undefined);
    const final = await settle(start.workflowRunId);
    expect(final.status).toBe("failed");
    expect(final.stageRuns.map((s) => `${s.phaseId}:${s.status}`)).toEqual(["a:done", "sub:error"]);
    expect(
      runner()
        .list()
        .filter((r) => r.parentRunId === start.workflowRunId),
    ).toHaveLength(1);
  });

  it("a cycle (A → B → A) yields an error stage and fails the parent", async () => {
    await create("sr-cyc-a", [phase("x")]).expect(201);
    await create("sr-cyc-b", [subPhase("sub", "sr-cyc-a")]).expect(201);
    // Close the loop: A now runs B.
    await request(app.getHttpServer())
      .patch("/api/workflows/sr-cyc-a")
      .send({ phases: [subPhase("sub", "sr-cyc-b")] })
      .expect(200);

    const start = await runner().start("sr-cyc-a", undefined, undefined);
    const final = await settle(start.workflowRunId);
    expect(final.status).toBe("failed");
    expect(final.stageRuns.map((s) => `${s.phaseId}:${s.status}`)).toEqual(["sub:error"]);
    const child = childOf(start.workflowRunId);
    expect(child?.status).toBe("failed");
    const err = await fs.readFile(
      path.join(child?.cwd ?? "", child?.stageRuns[0]?.dir ?? "", "sub-run.error.txt"),
      "utf8",
    );
    expect(err).toContain("cycle");
  });

  it("a parked child parks the parent (reason child); approving the child's gate finishes both", async () => {
    await create("sr-gate-child", [phase("c1", { approval: "ask" }), phase("c2")]).expect(201);
    await create("sr-gate-parent", [phase("a"), subPhase("sub", "sr-gate-child")]).expect(201);

    const start = await runner().start("sr-gate-parent", undefined, undefined);
    const parked = await until(async () => {
      const r = runner().get(start.workflowRunId);
      return r.status === "parked" ? r : null;
    });
    expect(parked.parkedReason).toBe("child");

    const child = await until(async () => childOf(start.workflowRunId));
    const gate = await until(() => pendingGate(child.workflowRunId));
    await app.get(ApprovalsService).approve(gate.id);

    const final = await until(async () => {
      const r = runner().get(start.workflowRunId);
      return r.status === "done" ? r : null;
    });
    expect(final.stageRuns.map((s) => s.phaseId)).toEqual(["a", "sub"]);
    expect(runner().get(child.workflowRunId).status).toBe("done");
  });
});
