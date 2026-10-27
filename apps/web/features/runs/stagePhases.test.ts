import { describe, expect, it } from "vitest";
import { buildPhaseNodes } from "./stagePhases";

describe("buildPhaseNodes", () => {
  it("keeps append order when a loop resets attempt numbers", () => {
    const nodes = buildPhaseNodes(
      [
        { phaseId: "produce", runId: "a", attempt: 2, status: "error" },
        { phaseId: "produce", runId: "b", attempt: 1, status: "done" },
      ],
      null,
      false,
      undefined,
    );
    expect(nodes[0]?.priorAttempts.map((s) => s.runId)).toEqual(["a"]);
    expect(nodes[0]?.main?.runId).toBe("b");
  });
});
