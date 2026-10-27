import { describe, expect, it } from "vitest";
import { stageModel } from "./stageModel";

const loop = (escalation: { model?: "opus" | "sonnet" | "haiku"; thinking?: "high" }[]) => ({
  to: "a",
  maxRetries: 3,
  escalate: true,
  then: "fail",
  escalation,
});

describe("stageModel", () => {
  it("phase model wins over agent", () => {
    expect(stageModel({ model: "sonnet" }, { model: "opus" }, 1)).toBe("sonnet");
  });
  it("falls back to the agent", () => {
    expect(stageModel({}, { model: "haiku" }, 1)).toBe("haiku");
  });
  it("escalates on retry and clamps to the last rung", () => {
    const phase = { model: "sonnet" as const, loop: loop([{ model: "opus" }]) };
    expect(stageModel(phase, undefined, 1)).toBe("sonnet");
    expect(stageModel(phase, undefined, 2)).toBe("opus");
    expect(stageModel(phase, undefined, 5)).toBe("opus");
  });
  it("a thinking-only rung keeps the phase model", () => {
    const phase = { model: "sonnet" as const, loop: loop([{ thinking: "high" }]) };
    expect(stageModel(phase, undefined, 2)).toBe("sonnet");
  });
  it("is undefined when nothing resolves", () => {
    expect(stageModel(undefined, undefined, 1)).toBeUndefined();
  });
});
