import { describe, expect, it } from "vitest";
import { childPath, normalizeSkeleton, rootPath } from "./normalize.mjs";

const node = (over = {}) => ({
  tag: "div",
  classes: [],
  attrs: {},
  text: "",
  values: {},
  box: { x: 0, y: 0, w: 100, h: 100 },
  layout: {
    display: "block",
    flexDirection: "row",
    gridTemplateColumns: "none",
    flexWrap: "nowrap",
    alignItems: "normal",
    order: 0,
  },
  children: [],
  ...over,
});

describe("normalizeSkeleton", () => {
  it("maps display + flex-direction to a single layout mode", () => {
    const grid = normalizeSkeleton(
      node({ layout: { ...node().layout, display: "grid", gridTemplateColumns: "1fr 1fr" } }),
    );
    expect(grid.layout.mode).toBe("grid");
    expect(grid.layout.columns).toBe(2);

    const col = normalizeSkeleton(
      node({ layout: { ...node().layout, display: "flex", flexDirection: "column" } }),
    );
    expect(col.layout.mode).toBe("flex-column");
  });

  it("expresses child geometry as a fraction of the parent", () => {
    const root = normalizeSkeleton(
      node({
        box: { x: 0, y: 0, w: 400, h: 200 },
        children: [node({ box: { x: 100, y: 50, w: 200, h: 100 } })],
      }),
    );
    expect(root.rel).toEqual({ w: 1, h: 1, x: 0, y: 0 });
    expect(root.children[0].rel).toEqual({ w: 0.5, h: 0.5, x: 0.25, y: 0.25 });
  });

  it("collapses a wrapper that has no own box and no layout mode", () => {
    const wrapper = node({
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } })],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapper] }),
    );
    expect(root.children).toHaveLength(1);
    expect(root.children[0].tag).toBe("label");
  });

  it("keeps the wrapper when strictWrappers is on", () => {
    const wrapper = node({
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } })],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapper] }),
      { strictWrappers: true },
    );
    expect(root.children[0].tag).toBe("div");
    expect(root.children[0].children[0].tag).toBe("label");
  });

  it("collapses a chain of 3 consecutive collapsible wrappers down to the surviving ancestor", () => {
    const innermostLabel = node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } });
    const wrapperC = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [innermostLabel],
    });
    const wrapperB = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [wrapperC],
    });
    const wrapperA = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [wrapperB],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapperA] }),
    );
    // All three wrappers collapse — the label is promoted directly onto root.
    expect(root.children).toHaveLength(1);
    expect(root.children[0].tag).toBe("label");
    expect(root.children[0].children).toHaveLength(0);
    // rel must be computed against the surviving ancestor (root's box), not any removed wrapper.
    expect(root.children[0].rel).toEqual({ w: 1, h: 1, x: 0, y: 0 });
  });

  it("keeps a whole chain of wrappers intact when strictWrappers is on", () => {
    const innermostLabel = node({ tag: "label", box: { x: 0, y: 0, w: 400, h: 200 } });
    const wrapperC = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [innermostLabel],
    });
    const wrapperB = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [wrapperC],
    });
    const wrapperA = node({
      tag: "div",
      box: { x: 0, y: 0, w: 400, h: 200 },
      children: [wrapperB],
    });
    const root = normalizeSkeleton(
      node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapperA] }),
      { strictWrappers: true },
    );
    expect(root.children[0].tag).toBe("div");
    expect(root.children[0].children[0].tag).toBe("div");
    expect(root.children[0].children[0].children[0].tag).toBe("div");
    expect(root.children[0].children[0].children[0].children[0].tag).toBe("label");
  });

  it("infers roles from tag and attributes", () => {
    const form = normalizeSkeleton(
      node({
        tag: "form",
        children: [
          node({ tag: "label", text: "E-mail" }),
          node({ tag: "input", attrs: { type: "email" } }),
          node({ tag: "button", text: "Odeslat" }),
        ],
      }),
    );
    expect(form.role).toBe("form");
    expect(form.children.map((c) => c.role)).toEqual(["label", "input", "action"]);
  });

  it("reorders children by CSS order when it differs from DOM order", () => {
    const root = normalizeSkeleton(
      node({
        layout: { ...node().layout, display: "flex" },
        children: [
          node({ tag: "b", layout: { ...node().layout, order: 2 } }),
          node({ tag: "a", layout: { ...node().layout, order: 1 } }),
        ],
      }),
    );
    expect(root.children.map((c) => c.tag)).toEqual(["a", "b"]);
  });

  describe("values", () => {
    it("carries the extracted values onto the normalised node", () => {
      const root = normalizeSkeleton(
        node({
          values: { gap: "12px" },
          children: [node({ tag: "label", values: { color: "red" } })],
        }),
      );
      expect(root.values).toEqual({ gap: "12px" });
      expect(root.children[0].values).toEqual({ color: "red" });
    });

    it("drops a collapsed wrapper's values along with the wrapper", () => {
      // The documented trade: wrapper collapsing already discards the wrapper's
      // structure, and now discards its values too — a pass-through wrapper
      // carrying a background colour stops being measured at all.
      const wrapper = node({
        values: { backgroundColor: "rgb(9, 9, 9)" },
        box: { x: 0, y: 0, w: 400, h: 200 },
        children: [
          node({ tag: "label", values: { color: "red" }, box: { x: 0, y: 0, w: 400, h: 200 } }),
        ],
      });
      const root = normalizeSkeleton(
        node({ box: { x: 0, y: 0, w: 400, h: 200 }, children: [wrapper] }),
      );
      expect(root.children).toHaveLength(1);
      expect(root.children[0].values).toEqual({ color: "red" });
    });

    it("defaults to an empty map for a raw node that carries no values", () => {
      const withoutValues = node();
      delete withoutValues.values;
      expect(normalizeSkeleton(withoutValues).values).toEqual({});
    });
  });

  describe("path convention", () => {
    // Single-sourced here so compare-skeleton.mjs and compare-values.mjs cannot
    // drift into two address spaces again — that drift was the whole defect.
    it("names the root by its readable role and a child by role[index]", () => {
      const root = normalizeSkeleton(
        node({ classes: ["card"], children: [node({ tag: "form" })] }),
      );
      expect(rootPath(root)).toBe("card");
      expect(childPath(rootPath(root), root.children[0], 0)).toBe("card/form[0]");
    });
  });

  describe("matchRole", () => {
    it("keeps class-name hints out of matchRole, falling back to the neutral 'node'", () => {
      const row = normalizeSkeleton(node({ classes: ["flex-row"] }));
      expect(row.role).toBe("row");
      expect(row.matchRole).toBe("node");
    });

    it("agrees with role when the role comes from the tag", () => {
      const form = normalizeSkeleton(node({ tag: "form" }));
      expect(form.role).toBe("form");
      expect(form.matchRole).toBe("form");
    });

    it("treats data-role as a first-class role source for both role and matchRole", () => {
      const widget = normalizeSkeleton(node({ attrs: { "data-role": "widget" } }));
      expect(widget.role).toBe("widget");
      expect(widget.matchRole).toBe("widget");
    });

    it("assigns two class-name synonyms the same matchRole even though their readable role differs", () => {
      const card = normalizeSkeleton(node({ classes: ["card"] }));
      const panel = normalizeSkeleton(node({ classes: ["panel"] }));
      expect(card.role).toBe("card");
      expect(panel.role).toBe("group");
      expect(card.role).not.toBe(panel.role);
      expect(card.matchRole).toBe(panel.matchRole);
      expect(card.matchRole).toBe("node");
    });

    it("prefers an explicit role attribute over data-role when a node carries both", () => {
      const both = normalizeSkeleton(node({ attrs: { role: "dialog", "data-role": "widget" } }));
      expect(both.role).toBe("dialog");
      expect(both.matchRole).toBe("dialog");
    });
  });
});
