import { describe, expect, it } from "vitest";
import { compareValues } from "./compare-values.mjs";

describe("compareValues", () => {
  it("returns nothing for identical values", () => {
    const v = { card: { gap: "12px", color: "rgb(1, 2, 3)" } };
    expect(compareValues(v, structuredClone(v))).toEqual([]);
  });

  it("reports a per-property delta with both sides", () => {
    const deltas = compareValues({ card: { gap: "16px" } }, { card: { gap: "12px" } });
    expect(deltas).toEqual([
      {
        path: "card",
        prop: "gap",
        expected: "16px",
        actual: "12px",
        message: "card: gap 16px vs 12px",
      },
    ]);
  });

  it("reports a missing node once, not once per property", () => {
    const deltas = compareValues({ "card/row[0]": { gap: "8px", color: "red" } }, {});
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ path: "card/row[0]", prop: "__missing__" });
  });

  it("ignores nodes the app has beyond the design", () => {
    expect(
      compareValues({ card: { gap: "8px" } }, { card: { gap: "8px" }, extra: { gap: "0px" } }),
    ).toEqual([]);
  });
});
