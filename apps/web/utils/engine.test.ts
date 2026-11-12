import { describe, expect, it } from "vitest";
import {
  formatEngine,
  lacksThinkingVariant,
  stepEngineChoice,
  tierConcreteModel,
  tierLevel,
} from "./engine";

describe("tier helpers", () => {
  it("numbers tiers weakest to strongest", () => {
    expect(["haiku", "sonnet", "opus", "fable"].map((t) => tierLevel(t as never))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("claude: the tier is the Claude model, mapping ignored", () => {
    expect(tierConcreteModel("opus", "claude", { opus: "x/y" }, "d/m")).toBe("Opus");
  });

  it("opencode: mapped tier, nearest lower, nearest higher, default, else empty", () => {
    const map = { sonnet: "a/sonnet", fable: "a/fable" };
    expect(tierConcreteModel("sonnet", "opencode", map, "d/m")).toBe("a/sonnet");
    expect(tierConcreteModel("opus", "opencode", map, "d/m")).toBe("a/sonnet");
    expect(tierConcreteModel("haiku", "opencode", { fable: "a/fable" }, "d/m")).toBe("a/fable");
    expect(tierConcreteModel("haiku", "opencode", {}, "d/m")).toBe("d/m");
    expect(tierConcreteModel("haiku", "opencode", {}, "")).toBe("");
  });

  it("formatEngine is untouched", () => {
    expect(formatEngine("opencode", "p/m")).toBe("opencode · p/m");
  });
});

describe("lacksThinkingVariant", () => {
  const models = [
    { id: "a/think", variants: ["low", "high"] },
    { id: "a/plain", variants: [] },
  ];
  it("flags a known model without the level", () => {
    expect(lacksThinkingVariant(models, "a/plain", "high")).toBe(true);
    expect(lacksThinkingVariant(models, "a/think", "medium")).toBe(true);
  });
  it("does not flag a supported level, an explicit #variant, or an unknown/empty model", () => {
    expect(lacksThinkingVariant(models, "a/think", "high")).toBe(false);
    expect(lacksThinkingVariant(models, "a/plain#max", "high")).toBe(false);
    expect(lacksThinkingVariant(models, "x/gone", "high")).toBe(false);
    expect(lacksThinkingVariant(models, "", "high")).toBe(false);
  });
});

describe("stepEngineChoice", () => {
  const agent = { engine: "opencode", engineModel: "a/agent" } as const;
  it("step model beats the agent's, which beats nothing", () => {
    expect(stepEngineChoice({ engine: "opencode", engineModel: "a/step" }, agent).engineModel).toBe(
      "a/step",
    );
    expect(stepEngineChoice({}, agent)).toEqual({ engine: "opencode", engineModel: "a/agent" });
    expect(stepEngineChoice({}, { engine: "opencode" }).engineModel).toBeUndefined();
  });
  it("drops the exact model off opencode", () => {
    expect(stepEngineChoice({ engine: "claude" }, agent)).toEqual({
      engine: "claude",
      engineModel: undefined,
    });
    expect(stepEngineChoice({}, undefined).engine).toBeUndefined();
  });
});
