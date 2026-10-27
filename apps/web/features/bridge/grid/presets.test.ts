import { describe, expect, it } from "vitest";
import { compact } from "./layout";
import {
  DEFAULT_LAYOUT,
  REVIEW_LAYOUT,
  arrangement,
  layoutNameError,
  layoutNames,
  nextSavedName,
  presetLayout,
} from "./presets";

describe("presets", () => {
  it("REVIEW is already compact", () => {
    expect(presetLayout("REVIEW", {})).toEqual(REVIEW_LAYOUT);
  });
  it("saved preset is compacted, unknown is empty", () => {
    const saved = { "MY LAYOUT 01": [{ id: "prs", type: "prs" as const, x: 0, y: 7, w: 4, h: 3 }] };
    expect(presetLayout("MY LAYOUT 01", saved)).toEqual(compact(saved["MY LAYOUT 01"]));
    expect(presetLayout("MY LAYOUT 01", saved)[0]?.y).toBe(0);
    expect(presetLayout("nope", {})).toEqual([]);
  });
  it("DEFAULT reads saved.DEFAULT, compacted", () => {
    const w = { id: "prs", type: "prs" as const, x: 0, y: 7, w: 4, h: 3 };
    expect(presetLayout("DEFAULT", { DEFAULT: [w] })).toEqual(compact([w]));
    expect(presetLayout("DEFAULT", {})).toEqual(compact(DEFAULT_LAYOUT));
  });
  it("nextSavedName fills gaps", () => {
    expect(nextSavedName({})).toBe("MY LAYOUT 01");
    expect(nextSavedName({ "MY LAYOUT 01": 1, "MY LAYOUT 03": 1 })).toBe("MY LAYOUT 02");
    expect(nextSavedName({ "MY LAYOUT 01": 1, "MY LAYOUT 02": 1 })).toBe("MY LAYOUT 03");
  });
  it("layoutNameError validates the trimmed name", () => {
    expect(layoutNameError("  ", {})).toBe("required");
    expect(layoutNameError("x".repeat(41), {})).toBe("tooLong");
    expect(layoutNameError("review", {})).toBe("reserved");
    expect(layoutNameError("my layout 01", { "MY LAYOUT 01": 1 })).toBe("taken");
    expect(layoutNameError("Mine", { "MY LAYOUT 01": 1 })).toBeNull();
  });
});

describe("layoutNames / arrangement", () => {
  it("lists REVIEW first unless removed or saved over", () => {
    expect(layoutNames({ A: [] }, [])).toEqual(["REVIEW", "A"]);
    expect(layoutNames({ A: [] }, ["REVIEW"])).toEqual(["A"]);
    expect(layoutNames({ A: [], REVIEW: [] }, [])).toEqual(["A", "REVIEW"]);
  });

  it("never lists DEFAULT", () => {
    expect(layoutNames({ DEFAULT: [], X: [] }, [])).toEqual(["REVIEW", "X"]);
  });

  it("drops stale names and appends unknown ones to hidden", () => {
    expect(
      arrangement(["REVIEW", "A", "B"], { shown: ["B", "gone"], hidden: ["REVIEW"] }, []),
    ).toEqual({ shown: ["B"], hidden: ["REVIEW", "A"] });
  });

  it("never arranged: REVIEW and favorites are shown", () => {
    expect(arrangement(["REVIEW", "A", "B"], null, ["B"])).toEqual({
      shown: ["REVIEW", "B"],
      hidden: ["A"],
    });
  });

  it("a saved REVIEW override resolves before the built-in", () => {
    const own = [{ id: "prs", type: "prs" as const, x: 0, y: 0, w: 4, h: 4 }];
    expect(presetLayout("REVIEW", { REVIEW: own })).toEqual(own);
  });
});
