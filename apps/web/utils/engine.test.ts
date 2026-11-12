import { describe, expect, it } from "vitest";
import { formatEngine, tierConcreteModel, tierLevel } from "./engine";

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
