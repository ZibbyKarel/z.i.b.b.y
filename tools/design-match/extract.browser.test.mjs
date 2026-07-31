import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { flattenValues } from "./cli.mjs";
import { extractRaw } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

/**
 * D5 (task 15), the half that made the other half unreadable. `extractRaw` did
 * raise a properly formed `design-match: selector not found: …` — but from
 * INSIDE `page.evaluate`, so Playwright re-wrapped it as
 * `page.evaluate: Error: design-match: …`. `isDeliberateError` tests
 * `message.startsWith("design-match:")`, which is then false, so the operator
 * got a full Playwright stack and `compare` wrote no artifacts at all. A
 * selector that matches nothing is the single most likely operator error in the
 * whole tool; it has to be one clean line.
 */
describe("extractRaw's missing-selector failure", () => {
  it("throws a design-match:-prefixed error that survives the page.evaluate boundary", async () => {
    const error = await withPage(async (page) => {
      await page.goto(fixture);
      return extractRaw(page, "#nothing-matches-this").catch((caught) => caught);
    });

    expect(error).toBeInstanceOf(Error);
    // The prefix must be at position 0. Raised inside page.evaluate it is not.
    expect(error.message.startsWith("design-match:")).toBe(true);
    expect(error.message).not.toContain("page.evaluate");
  });

  it("names the selector and the page it failed on", async () => {
    const error = await withPage(async (page) => {
      await page.goto(fixture);
      return extractRaw(page, "#nothing-matches-this").catch((caught) => caught);
    });

    expect(error.message).toContain("#nothing-matches-this");
    expect(error.message).toContain("basic.html");
  });
});

describe("extractors against real Chromium", () => {
  it("extracts a skeleton whose form is a 2-column grid with four rows", async () => {
    const skeleton = await withPage(async (page) => {
      await page.goto(fixture);
      return normalizeSkeleton(await extractRaw(page, '[data-region="card"]'));
    });

    const form = skeleton.children[0];
    expect(form.role).toBe("form");
    expect(form.layout.mode).toBe("grid");
    expect(form.layout.columns).toBe(2);
    expect(form.children).toHaveLength(4);
    expect(form.children[0].children.map((c) => c.role)).toEqual(["label", "input"]);
  });

  it("extracts computed values onto the same nodes as the skeleton, in one walk", async () => {
    const skeleton = await withPage(async (page) => {
      await page.goto(fixture);
      return normalizeSkeleton(await extractRaw(page, '[data-region="card"]'));
    });

    expect(skeleton.values.backgroundColor).toBe("rgb(17, 21, 29)");
    expect(skeleton.values.paddingTop).toBe("24px");
    expect(skeleton.children[0].values.gap).toBe("12px");

    // ...and the flat map the token/font consumers read is keyed by the
    // skeleton's own paths, not by a second walk's.
    const flat = flattenValues(skeleton);
    expect(flat["card/form[0]"].gap).toBe("12px");
    expect(Object.keys(flat)[0]).toBe("card");
  });

  it("honours a narrowed props list rather than always snapshotting all VALUE_PROPS", async () => {
    const raw = await withPage(async (page) => {
      await page.goto(fixture);
      return extractRaw(page, '[data-region="card"]', 6, ["backgroundColor"]);
    });

    expect(raw.values).toEqual({ backgroundColor: "rgb(17, 21, 29)" });
    expect(raw.children[0].values).toEqual({ backgroundColor: "rgba(0, 0, 0, 0)" });
  });

  it("extracts numeric CSS order and normalizeSkeleton sorts children by it", async () => {
    const { raw, ordered } = await withPage(async (page) => {
      await page.goto(fixture);
      const rawNode = await extractRaw(page, '[data-region="order-test"]');
      return { raw: rawNode, ordered: normalizeSkeleton(rawNode) };
    });

    // (a) kills a regression to `order: style.order` (a string) directly: every
    // extracted node's layout.order must be a real number.
    const flatten = (node) => [node, ...node.children.flatMap(flatten)];
    for (const node of flatten(raw)) {
      expect(typeof node.layout.order).toBe("number");
    }

    // (b) normalizeSkeleton must sort by the CSS `order` (1, 2, 3), not DOM
    // order (label, input, button) — identified by tag, not index.
    expect(ordered.children.map((c) => c.tag)).toEqual(["input", "button", "label"]);
  });

  it("derives roles from data-role, and the value paths are those same roles", async () => {
    // Inline content, not a fixture file: basic/repeated/animated.html are frozen,
    // and none of them exercises data-role. This pins Task 13's real finding —
    // extract.mjs used to own a second role derivation that read `role` but never
    // `data-role`, so a fixture declaring data-role got skeleton-layer role
    // parity while its value-layer paths silently diverged. There is only one
    // derivation now, so the two cannot disagree by construction; this keeps the
    // behaviour itself pinned.
    // The inner div gets an explicit width so its box differs from its parent's —
    // otherwise normalizeSkeleton's wrapper-collapsing would swallow it (it has
    // exactly one child and would otherwise share its parent's exact box),
    // which is a real behaviour of the tool but not what this test is pinning.
    const html = `<!doctype html><html><body>
      <div data-region="widget-test">
        <div data-role="widget" style="width: 50px"><span data-role="leaf-node">Leaf</span></div>
      </div>
    </body></html>`;

    const skeleton = await withPage(async (page) => {
      await page.setContent(html);
      return normalizeSkeleton(await extractRaw(page, '[data-region="widget-test"]'));
    });

    expect([
      skeleton.role,
      skeleton.children[0].role,
      skeleton.children[0].children[0].role,
    ]).toEqual(["group", "widget", "leaf-node"]);
    expect(Object.keys(flattenValues(skeleton))).toEqual([
      "group",
      "group/widget[0]",
      "group/widget[0]/leaf-node[0]",
    ]);
  });

  it("prefers role over data-role when a node carries both", async () => {
    const html = `<!doctype html><html><body>
      <div data-region="both-test" role="dialog" data-role="widget"></div>
    </body></html>`;

    const skeleton = await withPage(async (page) => {
      await page.setContent(html);
      return normalizeSkeleton(await extractRaw(page, '[data-region="both-test"]'));
    });

    expect(skeleton.role).toBe("dialog");
    expect(Object.keys(flattenValues(skeleton))).toEqual(["dialog"]);
  });

  it("collapses a real 2-level pass-through wrapper chain measured by real geometry, and strictWrappers preserves it", async () => {
    const raw = await withPage(async (page) => {
      await page.goto(fixture);
      return extractRaw(page, '[data-region="wrapper-test"]');
    });

    const collapsed = normalizeSkeleton(raw);
    expect(collapsed.children).toHaveLength(1);
    expect(collapsed.children[0].tag).toBe("span");
    expect(collapsed.children[0].children).toHaveLength(0);

    const strict = normalizeSkeleton(raw, { strictWrappers: true });
    expect(strict.children[0].tag).toBe("div");
    expect(strict.children[0].children[0].tag).toBe("div");
    expect(strict.children[0].children[0].children[0].tag).toBe("span");
  });
});
