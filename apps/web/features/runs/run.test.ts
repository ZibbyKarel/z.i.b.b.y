import { describe, expect, it } from "vitest";
import type {
  AgentRun,
  Approval,
  GoalRun,
  PipelineRun,
} from "@zibby/contracts";
import { approvalForRun, goalRunToView, mergeRunFeed, pipelineRunToView } from "./run";

const approval = (runId: string, kind: Approval["kind"]): Approval => ({
  id: `appr-${runId}`,
  runId,
  kind,
  skill: "Writer",
  action: "delete",
  detail: "remove files",
  risk: "medium",
  status: "pending",
  requestedAt: "2026-06-12T10:00:00.000Z",
});

const run = (over: Partial<Parameters<typeof approvalForRun>[1]> = {}) => ({
  runId: "writer_123_42",
  kind: "agent" as const,
  status: "awaiting-approval" as const,
  ...over,
});

describe("approvalForRun", () => {
  it("matches an agent run's approval exactly by runId", () => {
    const queue = [approval("writer_123_42", "agent")];
    expect(approvalForRun(queue, run())?.id).toBe("appr-writer_123_42");
  });

  it("matches a pipeline run's stage approval by prefix", () => {
    // Stage run ids are `${pipelineRunId}.${phaseId}_${ts}_${pid}`.
    const queue = [approval("release_1780000000000.build_1780000000123_77", "pipeline-stage")];
    const found = approvalForRun(queue, run({ runId: "release_1780000000000", kind: "pipeline" }));
    expect(found?.id).toBe("appr-release_1780000000000.build_1780000000123_77");
  });

  it("does not prefix-match a sibling pipeline run id", () => {
    // "release_1" must not match a stage of "release_12" — the dot is required.
    const queue = [approval("release_12.build_3_4", "pipeline-stage")];
    expect(approvalForRun(queue, run({ runId: "release_1", kind: "pipeline" }))).toBeUndefined();
  });

  it("does not prefix-match for agent runs", () => {
    const queue = [approval("writer_123_42.x", "pipeline-stage")];
    expect(approvalForRun(queue, run())).toBeUndefined();
  });

  it("returns undefined unless the run is awaiting approval", () => {
    const queue = [approval("writer_123_42", "agent")];
    expect(approvalForRun(queue, run({ status: "running" }))).toBeUndefined();
  });
});

const baseGoalRun = (over: Partial<GoalRun>): GoalRun => ({
  goalRunId: "ship_1",
  goalId: "ship",
  status: "running",
  currentIteration: 0,
  iterations: [],
  startedAt: "2026-06-13T10:00:00.000Z",
  cwd: "/tmp/goals/runs/ship_1",
  ...over,
});

describe("goalRunToView", () => {
  it("maps a running goal onto the feed view (kind goal, no pct/log)", () => {
    const v = goalRunToView(baseGoalRun({ currentIteration: 1 }));
    expect(v.kind).toBe("goal");
    expect(v.owner).toBe("ship");
    expect(v.status).toBe("running");
    expect(v.pct).toBeNull();
    expect(v.logBase).toBeNull();
    expect(v.goalId).toBe("ship");
    expect(v.prompt).toContain("2"); // currentIteration 1 → "iterace 2"
  });

  it("maps failed → error and done → done", () => {
    expect(goalRunToView(baseGoalRun({ status: "failed" })).status).toBe("error");
    expect(goalRunToView(baseGoalRun({ status: "done" })).status).toBe("done");
  });

  it("carries parked detail + reason for the resume panel", () => {
    const v = goalRunToView(
      baseGoalRun({
        status: "parked",
        parkedReason: "iterations",
        parked: { iteration: 1, attempts: 2, verdictFile: "/tmp/iteration-1.verdict.txt" },
      }),
    );
    expect(v.status).toBe("parked");
    expect(v.goalParkedReason).toBe("iterations");
    expect(v.goalParked?.attempts).toBe(2);
  });

  it("reflects a paused-limit goal with its resumeAt for the countdown", () => {
    const v = goalRunToView(baseGoalRun({ status: "paused-limit", resumeAt: 1_800_000_000_000 }));
    expect(v.status).toBe("paused-limit");
    expect(v.resumeAt).toBe(1_800_000_000_000);
  });

  it("preserves the iteration log for the timeline", () => {
    const iterations: GoalRun["iterations"] = [
      {
        index: 0,
        makerKind: "pipeline",
        verifier: { kind: "checks", satisfied: false, output: "red" },
        startedAt: "2026-06-13T10:00:00.000Z",
        status: "failed",
      },
    ];
    expect(goalRunToView(baseGoalRun({ iterations })).iterations).toHaveLength(1);
  });
});

const agentRun = (over: Partial<AgentRun> = {}): AgentRun => ({
  runId: "writer_1",
  agentId: "writer",
  status: "running",
  pct: 0,
  title: "",
  prompt: "do it",
  project: "proj",
  files: [],
  cwd: "/tmp/runs/writer_1",
  startedAt: "2026-06-13T10:00:00.000Z",
  pid: 1,
  logFile: "/tmp/runs/writer_1.log",
  ...over,
});

const pipelineRun = (over: Partial<PipelineRun> = {}): PipelineRun => ({
  pipelineRunId: "delivery_1",
  pipelineId: "delivery",
  status: "running",
  currentStage: "write",
  stageRuns: [],
  startedAt: "2026-06-13T10:00:00.000Z",
  cwd: "/tmp/runs/delivery_1",
  ...over,
});

/** A goal whose single iteration dispatched `makerRunRef` (and, optionally, a claude verifier run). */
const goalWithChildren = (
  makerRunRef: string,
  makerKind: "agent" | "pipeline",
  verifierRunRef?: string,
): GoalRun =>
  baseGoalRun({
    goalRunId: "ship_1",
    iterations: [
      {
        index: 0,
        makerKind,
        makerRunRef,
        verifier: {
          kind: "claude",
          satisfied: false,
          output: "",
          ...(verifierRunRef ? { runRef: verifierRunRef } : {}),
        },
        startedAt: "2026-06-13T10:00:05.000Z",
        status: "running",
      },
    ],
  });

describe("mergeRunFeed (one card per task — fold a loop's child runs)", () => {
  it("folds a goal's child agent run — the loop is ONE card, not two", () => {
    const feed = mergeRunFeed(
      [agentRun({ runId: "writer_child" })],
      [],
      [goalWithChildren("writer_child", "agent")],
      [],
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]?.kind).toBe("goal");
  });

  it("folds a goal's child pipeline run", () => {
    const feed = mergeRunFeed(
      [],
      [pipelineRun({ pipelineRunId: "delivery_child" })],
      [goalWithChildren("delivery_child", "pipeline")],
      [],
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]?.kind).toBe("goal");
  });

  it("folds the goal's claude verifier run too", () => {
    const feed = mergeRunFeed(
      [agentRun({ runId: "verify_child" })],
      [],
      [goalWithChildren("maker_x", "agent", "verify_child")],
      [],
    );
    expect(feed.map((r) => r.kind)).toEqual(["goal"]);
  });

  it("keeps a standalone agent run that is not any goal's child", () => {
    const feed = mergeRunFeed(
      [agentRun({ runId: "solo" })],
      [],
      [goalWithChildren("other_child", "agent")],
      [],
    );
    expect(feed).toHaveLength(2);
    expect(feed.map((r) => r.kind).sort()).toEqual(["agent", "goal"]);
  });

  it("sorts the feed newest-first", () => {
    const feed = mergeRunFeed(
      [
        agentRun({ runId: "old", startedAt: "2026-06-13T09:00:00.000Z" }),
        agentRun({ runId: "new", startedAt: "2026-06-13T12:00:00.000Z" }),
      ],
      [],
      [],
      [],
    );
    expect(feed.map((r) => r.runId)).toEqual(["new", "old"]);
  });
});

describe("pipelineRunToView (28 — stage timeline source)", () => {
  it("carries the per-phase stage runs onto the view for the detail timeline", () => {
    const v = pipelineRunToView(
      pipelineRun({
        stageRuns: [
          { phaseId: "build", runId: "delivery_1.build_1", attempt: 1, status: "done" },
          { phaseId: "verify", runId: "delivery_1.verify_2", attempt: 2, status: "running" },
        ],
      }),
    );
    expect(v.kind).toBe("pipeline");
    expect(v.stageRuns).toHaveLength(2);
    expect(v.stageRuns?.[1]?.attempt).toBe(2);
    expect(v.stageRuns?.[1]?.phaseId).toBe("verify");
  });
});
