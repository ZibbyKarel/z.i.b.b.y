import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { collectRegions } from "./inventory.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

describe("collectRegions", () => {
  it("excludes html/body and anything under 24×24", async () => {
    const regions = await withPage(async (page) => {
      await page.goto(fixture);
      return collectRegions(page);
    });
    expect(regions.some((r) => r.tag === "body")).toBe(false);
    expect(regions.every((r) => r.box.w >= 24 && r.box.h >= 24)).toBe(true);
    expect(regions.some((r) => r.classes.includes("card"))).toBe(true);
  });
});
