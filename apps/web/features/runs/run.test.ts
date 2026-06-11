import { describe, expect, it } from "vitest";
import type { Approval } from "@zibby/contracts";
import { approvalForRun } from "./run";

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
