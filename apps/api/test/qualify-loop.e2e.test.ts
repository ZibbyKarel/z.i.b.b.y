import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { AppModule } from "../src/app.module";
import { PipelineRunnerService } from "../src/pipelines/pipeline-runner.service";

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

/**
 * Phase 45 — the qualify back-edge end to end (demo, token-free). A `qualify` review
 * phase emits `<verdict>gap</verdict>` on its first attempt then `<verdict>pass</verdict>`
 * (the demo-stage GAP lever); the runner loops the work back on gap and advances on pass,
 * and records a `stage-verdict` activity entry for each grading.
 */
describe("Qualify loop (e2e)", () => {
  let app: INestApplication;
  let pipelinesDir: string;
  let runsDir: string;
  let activityDir: string;

  beforeAll(async () => {
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualify-pipes-e2e-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualify-runs-e2e-"));
    activityDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualify-activity-e2e-"));
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.PIPELINE_RUNS_DIR = runsDir;
    process.env.ACTIVITY_DIR = activityDir;
    // Demo mode (vitest.setup already defaults it; pin explicitly — the committed
    // .env forces claude locally) + the qualify GAP lever for the review phase.
    process.env.AGENT_RUNNER_MODE = "demo";
    process.env.AGENT_DEMO_STEPS = "2";
    process.env.AGENT_DEMO_DELAY_MS = "30";
    process.env.PIPELINE_DEMO_GAP_PHASES = "review";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(pipelinesDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(runsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(activityDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    for (const k of [
      "PIPELINES_DIR",
      "PIPELINE_RUNS_DIR",
      "ACTIVITY_DIR",
      "AGENT_DEMO_STEPS",
      "AGENT_DEMO_DELAY_MS",
      "PIPELINE_DEMO_GAP_PHASES",
    ]) {
      delete process.env[k];
    }
  });

  it("gap loops back to fixing, pass advances; the verdicts surface on the stage + activity", async () => {
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "qualified",
        phases: [
          phase("a"),
          phase("review", {
            qualify: true,
            loop: { to: "a", driftTo: "a", maxRetries: 1, escalate: false, then: "park" },
          }),
          phase("z"),
        ],
        instructions: "a → review (qualify) → z",
        ownerSubsystem: "forge",
      })
      .expect(201);

    const start = await app.get(PipelineRunnerService).start("qualified", undefined, undefined);
    const { pipelineRunId } = start;

    const final = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });

    // The gate looped the work back on gap, then accepted it on pass → end reached.
    expect(final.status).toBe("done");
    const reviews = final.stageRuns.filter((s) => s.phaseId === "review");
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.attempt).toBe(1);
    expect(reviews[0]?.verdict).toBe("gap");
    expect(reviews[1]?.attempt).toBe(2);
    expect(reviews[1]?.verdict).toBe("pass");
    // It looped back through `a` (the fix-in-place target) and finished at `z`.
    expect(final.stageRuns.some((s) => s.phaseId === "z")).toBe(true);

    // The verdict survives the PipelineRun → TaskRun mapping the web actually reads
    // (the stage timeline consumes TaskRun, not the raw PipelineRun) — so the chip
    // is not a no-op in production.
    const view = await request(app.getHttpServer())
      .get(`/api/tasks/runs/${pipelineRunId}`)
      .expect(200);
    const viewReviews = (
      view.body.stageRuns as Array<{ phaseId: string; verdict?: string }>
    ).filter((s) => s.phaseId === "review");
    expect(viewReviews.map((s) => s.verdict)).toEqual(["gap", "pass"]);

    // Each grading was recorded on the accountability ledger.
    const res = await request(app.getHttpServer())
      .get("/api/activity")
      .query({ limit: 500 })
      .expect(200);
    const verdicts = (res.body as ActivityEntry[]).filter((e) => e.kind === "stage-verdict");
    expect(verdicts.map((e) => e.refs.status).sort()).toEqual(["gap", "pass"]);
  });
});
