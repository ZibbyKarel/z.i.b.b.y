import { describe, expect, it } from "vitest";
import { countBusyRuns } from "./activeRuns";

describe("countBusyRuns", () => {
  it("counts only runs a restart would kill", () => {
    const runs = [
      { status: "running" },
      { status: "pending" },
      { status: "done" },
      { status: "awaiting-approval" },
      { status: "queued" },
      { status: "paused" },
    ];
    expect(countBusyRuns(runs)).toBe(2);
  });

  it("treats a non-array body as no runs", () => {
    expect(countBusyRuns({ error: "x" })).toBe(0);
  });
});
