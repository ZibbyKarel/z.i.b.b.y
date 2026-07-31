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
});
