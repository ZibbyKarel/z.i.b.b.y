import { describe, expect, it } from "vitest";
import { samePick } from "./widgetFilters";

describe("samePick", () => {
  it("ignores key order, list order and unset groups", () => {
    expect(samePick({ teams: ["b", "a"], ci: [] }, { teams: ["a", "b"] })).toBe(true);
    expect(samePick({ owner: "mine" }, { mine: true })).toBe(true);
    expect(samePick({}, {})).toBe(true);
  });

  it("flags a pick that moved away from the defaults", () => {
    expect(samePick({ teams: ["a"] }, { teams: ["a", "b"] })).toBe(false);
    expect(samePick({}, { owner: "mine" })).toBe(false);
  });
});
