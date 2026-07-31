import { describe, expect, it } from "vitest";
import { compareSkeletons } from "./compare-skeleton.mjs";

// matchRole defaults to whatever role this call sets, so every pre-existing test
// below — written before matchRole existed — keeps comparing "role" values as it
// always did. Tests that care about the role/matchRole split override matchRole
// explicitly.
const leaf = (over = {}) => {
  const role = over.role ?? "text";
  return {
    role,
    matchRole: role,
    tag: "span",
    layout: { mode: "block", direction: "row", columns: 0, wrap: "nowrap", align: "normal" },
    rel: { w: 1, h: 1, x: 0, y: 0 },
    children: [],
    ...over,
  };
};

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

  it("flags a root whose own role differs from the design, even with identical structure otherwise", () => {
    const design = leaf({
      role: "form",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    const app = leaf({
      role: "group",
      children: [leaf({ role: "label" }), leaf({ role: "input" })],
    });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]).toMatchObject({
      path: "form",
      kind: "role",
      expected: "form",
      actual: "group",
    });
  });

  it("does not stop descent when the root role mismatches, so deeper findings still surface", () => {
    const design = leaf({
      role: "form",
      children: [leaf({ role: "row", children: [leaf(), leaf()] })],
    });
    const app = leaf({
      role: "group",
      children: [leaf({ role: "row", children: [leaf()] })],
    });
    const verdict = compareSkeletons(design, app);
    expect(verdict.pass).toBe(false);
    expect(verdict.findings.some((f) => f.kind === "role" && f.path === "form")).toBe(true);
    expect(verdict.findings.some((f) => f.kind === "child-count")).toBe(true);
  });

  describe("matchRole vs role", () => {
    it("passes a root whose readable role differs only by naming convention, when matchRole agrees", () => {
      // e.g. a design's <div class="card"> rebuilt as <div class="panel"> — both
      // are plain divs with no tag mapping and no explicit role, so matchRole
      // collapses both to "node" even though role diverges to "card"/"group".
      const design = leaf({ role: "card", matchRole: "node" });
      const app = leaf({ role: "panel", matchRole: "node" });
      expect(compareSkeletons(design, app)).toEqual({ pass: true, findings: [] });
    });

    it("flags a root role mismatch using matchRole in expected/actual/message, not the readable role", () => {
      const design = leaf({ role: "form", matchRole: "form" });
      const app = leaf({ role: "form-shaped-div", matchRole: "node" });
      const verdict = compareSkeletons(design, app);
      expect(verdict.pass).toBe(false);
      expect(verdict.findings).toHaveLength(1);
      expect(verdict.findings[0]).toMatchObject({
        path: "form", // childPath/root path still uses the readable role
        kind: "role",
        expected: "form",
        actual: "node",
        message: "role kořene: form vs node",
      });
    });

    it("does not flag child-order when children's roles differ only by class-name convention", () => {
      const design = leaf({
        role: "form",
        matchRole: "form",
        children: [
          leaf({ role: "card", matchRole: "node" }),
          leaf({ role: "row", matchRole: "node" }),
        ],
      });
      const app = leaf({
        role: "form",
        matchRole: "form",
        children: [
          leaf({ role: "panel", matchRole: "node" }),
          leaf({ role: "group", matchRole: "node" }),
        ],
      });
      expect(compareSkeletons(design, app)).toEqual({ pass: true, findings: [] });
    });

    it("still catches a design <label>/<input> pair rebuilt in the opposite order — both tags carry a real matchRole", () => {
      const design = leaf({
        role: "form",
        matchRole: "form",
        children: [
          leaf({ role: "label", matchRole: "label" }),
          leaf({ role: "input", matchRole: "input" }),
        ],
      });
      const app = leaf({
        role: "form",
        matchRole: "form",
        children: [
          leaf({ role: "input", matchRole: "input" }),
          leaf({ role: "label", matchRole: "label" }),
        ],
      });
      const verdict = compareSkeletons(design, app);
      expect(verdict.pass).toBe(false);
      const finding = verdict.findings.find((f) => f.kind === "child-order");
      expect(finding).toMatchObject({ expected: "label,input", actual: "input,label" });
    });

    it("keeps childPath built from the readable role even when matchRole is the generic 'node' value", () => {
      const design = leaf({
        role: "card",
        matchRole: "node",
        children: [leaf({ role: "row", matchRole: "node", rel: { w: 0.48, h: 1, x: 0, y: 0 } })],
      });
      const app = leaf({
        role: "card",
        matchRole: "node",
        children: [leaf({ role: "row", matchRole: "node", rel: { w: 1, h: 1, x: 0, y: 0 } })],
      });
      const verdict = compareSkeletons(design, app);
      expect(verdict.findings.some((f) => f.kind === "size" && f.path === "card/row[0]")).toBe(
        true,
      );
    });
  });

  describe("size check includes position, not just w/h", () => {
    it("flags two equal-sized siblings swapped in position, even though matchRole and w/h all agree", () => {
      const design = leaf({
        role: "row",
        children: [
          leaf({ role: "cell", rel: { w: 0.5, h: 1, x: 0, y: 0 } }),
          leaf({ role: "cell", rel: { w: 0.5, h: 1, x: 0.5, y: 0 } }),
        ],
      });
      const app = leaf({
        role: "row",
        children: [
          leaf({ role: "cell", rel: { w: 0.5, h: 1, x: 0.5, y: 0 } }),
          leaf({ role: "cell", rel: { w: 0.5, h: 1, x: 0, y: 0 } }),
        ],
      });
      const verdict = compareSkeletons(design, app);
      expect(verdict.pass).toBe(false);
      expect(verdict.findings.some((f) => f.kind === "size" && f.path === "row/cell[0]")).toBe(
        true,
      );
    });

    it("ignores a sub-tolerance position difference the same way it already does for size", () => {
      const design = leaf({
        role: "card",
        children: [leaf({ rel: { w: 0.5, h: 1, x: 0.1, y: 0.2 } })],
      });
      const app = leaf({
        role: "card",
        children: [leaf({ rel: { w: 0.5, h: 1, x: 0.109, y: 0.2 } })],
      });
      expect(compareSkeletons(design, app).pass).toBe(true);
    });

    it("names the x/y axis correctly in the message, rather than calling a position delta a width/height delta", () => {
      const design = leaf({
        role: "card",
        children: [leaf({ role: "row", rel: { w: 1, h: 1, x: 0, y: 0 } })],
      });
      const app = leaf({
        role: "card",
        children: [leaf({ role: "row", rel: { w: 1, h: 1, x: 0.5, y: 0 } })],
      });
      const verdict = compareSkeletons(design, app);
      const finding = verdict.findings.find((f) => f.kind === "size" && f.path === "card/row[0]");
      expect(finding).toBeDefined();
      expect(finding.message).not.toContain("šířka");
      expect(finding.message).not.toContain("výška");
      expect(finding.message).toContain("pozice X");
    });
  });
});
