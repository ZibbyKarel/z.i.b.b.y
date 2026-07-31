import { describe, expect, it } from "vitest";
import { compareSkeletons } from "./compare-skeleton.mjs";

const leaf = (over = {}) => ({
  role: "text",
  tag: "span",
  layout: { mode: "block", direction: "row", columns: 0, wrap: "nowrap", align: "normal" },
  rel: { w: 1, h: 1, x: 0, y: 0 },
  children: [],
  ...over,
});

describe("compareSkeletons", () => {
  it("passes for identical trees", () => {
    const tree = leaf({
      role: "form",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    expect(compareSkeletons(tree, structuredClone(tree))).toEqual({ pass: true, findings: [] });
  });

  it("flags a different layout mode", () => {
    const design = leaf({ role: "form", layout: { ...leaf().layout, mode: "grid", columns: 2 } });
    const app = leaf({ role: "form", layout: { ...leaf().layout, mode: "flex-column" } });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings[0]).toMatchObject({
      kind: "layout-mode",
      expected: "grid",
      actual: "flex-column",
      path: "form",
    });
  });

  it("flags a differing child count", () => {
    const design = leaf({ role: "form", children: [leaf(), leaf(), leaf()] });
    const app = leaf({ role: "form", children: [leaf(), leaf()] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(
      verdict.findings.some((f) => f.kind === "child-count" && f.expected === 3 && f.actual === 2),
    ).toBe(true);
  });

  it("flags children in a different order", () => {
    const design = leaf({
      role: "row",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    const app = leaf({ role: "row", children: [leaf({ role: "input" }), leaf({ role: "label" })] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "child-order")).toBe(true);
  });

  it("flags an element that is materially smaller than the design", () => {
    const design = leaf({
      role: "card",
      children: [leaf({ role: "row", rel: { w: 0.48, h: 1, x: 0, y: 0 } })],
    });
    const app = leaf({
      role: "card",
      children: [leaf({ role: "row", rel: { w: 1, h: 1, x: 0, y: 0 } })],
    });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "size" && f.path === "card/row[0]")).toBe(true);
  });

  it("ignores sub-tolerance size differences", () => {
    const design = leaf({ role: "card", children: [leaf({ rel: { w: 0.5, h: 1, x: 0, y: 0 } })] });
    const app = leaf({ role: "card", children: [leaf({ rel: { w: 0.51, h: 1, x: 0, y: 0 } })] });
    expect(compareSkeletons(design, app).pass).toBe(true);
  });

  it("stops descending into a subtree whose child count already differs", () => {
    const design = leaf({
      role: "form",
      children: [leaf({ role: "row", children: [leaf(), leaf()] })],
    });
    const app = leaf({ role: "form", children: [] });
    const verdict = compareSkeletons(design, app);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].kind).toBe("child-count");
  });
});
