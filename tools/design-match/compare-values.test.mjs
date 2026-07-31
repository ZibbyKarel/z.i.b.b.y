import { describe, expect, it } from "vitest";
import { compareValues } from "./compare-values.mjs";

/** A normalised skeleton node, trimmed to the parts compareValues actually reads. */
const node = (over = {}) => ({ role: "group", values: {}, children: [], ...over });

describe("compareValues", () => {
  it("returns nothing for identical values", () => {
    const tree = node({ role: "card", values: { gap: "12px", color: "rgb(1, 2, 3)" } });
    expect(compareValues(tree, structuredClone(tree))).toEqual([]);
  });

  it("reports a per-property delta with both sides, keyed by the skeleton path", () => {
    const deltas = compareValues(
      node({ role: "card", values: { gap: "16px" } }),
      node({ role: "card", values: { gap: "12px" } }),
    );
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

  it("keys a nested delta with the same role[index] path compareSkeletons reports", () => {
    const design = node({
      role: "card",
      children: [node({ role: "row", values: { gap: "8px" } })],
    });
    const app = node({
      role: "group",
      children: [node({ role: "column", values: { gap: "4px" } })],
    });
    // The design's own readable role names the path on both sides — the app's
    // class-derived role never renames a node out of the shared address space.
    expect(compareValues(design, app).map((d) => d.path)).toEqual(["card/row[0]"]);
  });

  it("descends the whole tree, not just the root", () => {
    const leaf = (gap) => node({ role: "input", values: { gap } });
    const design = node({
      role: "form",
      children: [node({ role: "row", children: [leaf("8px")] })],
    });
    const app = node({ role: "form", children: [node({ role: "row", children: [leaf("2px")] })] });
    expect(compareValues(design, app)).toEqual([
      {
        path: "form/row[0]/input[0]",
        prop: "gap",
        expected: "8px",
        actual: "2px",
        message: "form/row[0]/input[0]: gap 8px vs 2px",
      },
    ]);
  });

  it("ignores props the app carries beyond the design's", () => {
    expect(
      compareValues(
        node({ role: "card", values: { gap: "8px" } }),
        node({ role: "card", values: { gap: "8px", color: "red" } }),
      ),
    ).toEqual([]);
  });

  it("throws rather than reporting a value delta when the trees do not pair", () => {
    // Unreachable through the CLI — values are only compared after the skeleton
    // gate passed, and the gate rejects a child-count difference. If it ever
    // happens the gate is broken, and saying so is the only honest answer;
    // reporting it as "this node is missing" is what this task deleted.
    expect(() =>
      compareValues(node({ role: "card", children: [node()] }), node({ role: "card" })),
    ).toThrow(/skeleton/);
  });

  it("throws that as a real crash, not one of the tool's deliberate usage errors", () => {
    // cli.mjs's `isDeliberateError` treats a `design-match:`-prefixed message as
    // a clean operator-facing usage error and logs one line with no stack. This
    // error means "this was supposed to be impossible" — the stack IS the
    // diagnostic, so it must deliberately break the prefix convention.
    let thrown;
    try {
      compareValues(node({ role: "card", children: [node()] }), node({ role: "card" }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message.startsWith("design-match:")).toBe(false);
  });
});
