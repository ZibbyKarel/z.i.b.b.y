import { describe, expect, it } from "vitest";
import { aggregateZibbyState } from "./aggregateZibbyState";

describe("aggregateZibbyState", () => {
  it("stays idle with no agents or only idle/done ones", () => {
    expect(aggregateZibbyState("idle", [])).toBe("idle");
    expect(aggregateZibbyState("idle", ["idle", "done"])).toBe("idle");
  });
  it("mirrors working over idle", () => {
    expect(aggregateZibbyState("idle", ["idle", "working"])).toBe("working");
  });
  it("blocked beats working, error beats blocked", () => {
    expect(aggregateZibbyState("idle", ["working", "blocked"])).toBe("blocked");
    expect(aggregateZibbyState("working", ["blocked", "error", "working"])).toBe("error");
  });
  it("never lowers its own state", () => {
    expect(aggregateZibbyState("error", ["working", "idle"])).toBe("error");
    expect(aggregateZibbyState("blocked", ["working"])).toBe("blocked");
  });
});
