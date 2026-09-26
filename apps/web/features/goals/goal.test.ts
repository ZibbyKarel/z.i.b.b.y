import { describe, expect, it } from "vitest";
import type { GoalIteration } from "@zibby/contracts";
import { goalStateTone, latestIterationSummary } from "./goal";

describe("goalStateTone", () => {
  it("maps every goal-run TaskRunStatus onto the canonical StateTone vocabulary", () => {
    expect(goalStateTone("running")).toBe("working");
    expect(goalStateTone("paused-limit")).toBe("thinking");
    expect(goalStateTone("parked")).toBe("blocked");
    expect(goalStateTone("error")).toBe("error");
    expect(goalStateTone("done")).toBe("done");
    expect(goalStateTone("interrupted")).toBe("idle");
  });

  it("defaults to idle when the goal has never run", () => {
    expect(goalStateTone(undefined)).toBe("idle");
  });
});

describe("latestIterationSummary", () => {
  const base: GoalIteration = {
    index: 0,
    makerKind: "agent",
    verifier: { kind: "checks", satisfied: false, output: "" },
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "done",
  };

  it("returns undefined with no iterations", () => {
    expect(latestIterationSummary([])).toBeUndefined();
  });

  it("summarizes the latest iteration's outcome", () => {
    expect(latestIterationSummary([base])).toBe("Iteration 1 · verifier failed");
    expect(
      latestIterationSummary([{ ...base, verifier: { ...base.verifier, satisfied: true } }]),
    ).toBe("Iteration 1 · verifier passed");
    expect(latestIterationSummary([{ ...base, status: "running" }])).toBe(
      "Iteration 1 · verifier running",
    );
  });

  it("reads the last iteration, not the first", () => {
    const second: GoalIteration = { ...base, index: 1, status: "running" };
    expect(latestIterationSummary([base, second])).toBe("Iteration 2 · verifier running");
  });
});
