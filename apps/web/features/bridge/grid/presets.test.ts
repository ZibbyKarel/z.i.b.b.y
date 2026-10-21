import { describe, expect, it } from "vitest";
import { compact } from "./layout";
import { REVIEW_LAYOUT, nextSavedName, presetLayout } from "./presets";

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
  it("nextSavedName fills gaps", () => {
    expect(nextSavedName({})).toBe("MY LAYOUT 01");
    expect(nextSavedName({ "MY LAYOUT 01": 1, "MY LAYOUT 03": 1 })).toBe("MY LAYOUT 02");
    expect(nextSavedName({ "MY LAYOUT 01": 1, "MY LAYOUT 02": 1 })).toBe("MY LAYOUT 03");
  });
});
