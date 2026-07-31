import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { extractRaw, extractValues } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

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

  it("extracts computed values including the exact background", async () => {
    const values = await withPage(async (page) => {
      await page.goto(fixture);
      return extractValues(page, '[data-region="card"]');
    });

    expect(values.card.backgroundColor).toBe("rgb(17, 21, 29)");
    expect(values.card.paddingTop).toBe("24px");
    expect(values["card/form[0]"].gap).toBe("12px");
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
