import { describe, expect, it } from "vitest";
import { MergeWatchSchema, MergeWatchStateSchema } from "./merge-watch.schema";

const valid = {
  id: "merge-acme-app-abc123",
  projectId: "acme",
  repo: "acme/app",
  sha: "abc123",
  prNumber: 42,
  prTitle: "Fix flaky test",
  mergedAt: "2026-07-17T09:00:00.000Z",
  deadline: "2026-07-17T11:00:00.000Z",
  attempts: 0,
  state: "watching",
};

describe("MergeWatchStateSchema", () => {
  it("accepts every documented state", () => {
    for (const state of ["watching", "green", "red", "expired"]) {
      expect(MergeWatchStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it("rejects an unknown state", () => {
    expect(MergeWatchStateSchema.safeParse("merged").success).toBe(false);
  });
});

describe("MergeWatchSchema", () => {
  it("parses a freshly-recorded watching entry", () => {
    const parsed = MergeWatchSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.taskId).toBeUndefined();
  });

  it("parses a red entry carrying the dispatched fix task's id", () => {
    const parsed = MergeWatchSchema.safeParse({ ...valid, state: "red", taskId: "task_123" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.taskId).toBe("task_123");
  });

  it("rejects negative attempts", () => {
    expect(MergeWatchSchema.safeParse({ ...valid, attempts: -1 }).success).toBe(false);
  });

  it("rejects a non-integer prNumber", () => {
    expect(MergeWatchSchema.safeParse({ ...valid, prNumber: 42.5 }).success).toBe(false);
  });

  it("rejects a missing sha/repo/projectId", () => {
    for (const key of ["sha", "repo", "projectId"] as const) {
      const rest = Object.fromEntries(Object.entries(valid).filter(([k]) => k !== key));
      expect(MergeWatchSchema.safeParse(rest).success).toBe(false);
    }
  });
});
