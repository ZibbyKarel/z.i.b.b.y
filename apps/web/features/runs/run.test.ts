import { describe, expect, it } from "vitest";
import type { Approval, GoalRun } from "@zibby/contracts";
import { approvalForRun, goalRunToView } from "./run";

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
