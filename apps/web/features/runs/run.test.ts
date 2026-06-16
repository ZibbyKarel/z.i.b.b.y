import { describe, expect, it } from "vitest";
import type { Approval } from "@zibby/contracts";
import { type RunView, approvalForRun, runTitle } from "./run";

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

  it("resolves a budget-held task's spend-past-cap override by approvalId", () => {
    // A held dispatch isn't "awaiting-approval" (it hasn't run) but names its override.
    const queue = [approval("spend_cap_1", "task")];
    const found = approvalForRun(
      queue,
      run({ runId: "task_9", kind: "scheduled", status: "held", approvalId: "appr-spend_cap_1" }),
    );
    expect(found?.id).toBe("appr-spend_cap_1");
  });

  it("returns undefined for a held task with no override approval", () => {
    const queue = [approval("spend_cap_1", "task")];
    expect(
      approvalForRun(queue, run({ runId: "task_9", kind: "scheduled", status: "held" })),
    ).toBeUndefined();
  });
});

/** A minimal feed row (the server merge is unit-tested in apps/api task-runs.service.test). */
const mkRun = (over: Partial<RunView> = {}): RunView => ({
  runId: "delivery_1",
  kind: "pipeline",
  owner: "delivery",
  status: "running",
  pct: null,
  title: "",
  prompt: "",
  project: "",
  startedAt: "2026-06-13T10:00:00.000Z",
  logBase: null,
  ...over,
});

describe("runTitle (task name, not the phase)", () => {
  it("titles a task-dispatched pipeline run with the task name, not 'fáze: X'", () => {
    // A pipeline run's prompt is the "fáze: X" progress string; once enriched with
    // its originating task, the headline must be the task's own name.
    const v = mkRun({ prompt: "fáze: write", taskTitle: "Fix the login bug" });
    expect(runTitle(v)).toBe("Fix the login bug");
  });

  it("falls a task-less pipeline run back to its pipeline id, never the phase", () => {
    expect(runTitle(mkRun({ prompt: "fáze: write" }))).toBe("delivery");
  });

  it("titles an agent run by its prompt when it has no task name", () => {
    expect(runTitle(mkRun({ kind: "agent", owner: "writer", prompt: "do it" }))).toBe("do it");
  });
});
