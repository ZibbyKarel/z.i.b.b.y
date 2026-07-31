import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_SCALE_FACTOR, withPage } from "./browser.mjs";
import { collectRegions, cropRegions } from "./inventory.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

const repeatedFixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "repeated.html"),
).href;

const tallFixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "tall.html"),
).href;

let tmpDirs = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-inventory-"));
  tmpDirs.push(dir);
  return dir;
}

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

  it("gives every region a selector that resolves to exactly one element", async () => {
    const counts = await withPage(async (page) => {
      await page.goto(fixture);
      const regions = await collectRegions(page);
      return page.evaluate(
        (selectors) => selectors.map((selector) => document.querySelectorAll(selector).length),
        regions.map((r) => r.selector),
      );
    });
    expect(counts.every((n) => n === 1)).toBe(true);
  });

  it("never produces duplicate selectors across all regions", async () => {
    const regions = await withPage(async (page) => {
      await page.goto(fixture);
      return collectRegions(page);
    });
    const selectors = regions.map((r) => r.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it("gives the four .row divs four different selectors", async () => {
    const regions = await withPage(async (page) => {
      await page.goto(fixture);
      return collectRegions(page);
    });
    const rowSelectors = regions.filter((r) => r.classes.includes("row")).map((r) => r.selector);
    expect(rowSelectors).toHaveLength(4);
    expect(new Set(rowSelectors).size).toBe(4);
  });

  // Structurally identical, non-sibling widget subtrees (fixtures/repeated.html):
  // per-level :nth-child never fires (each instance is unique among its own
  // siblings), so an unanchored chain built from the top-level instance can
  // still match the nested lookalike's descendants too.
  it("gives every region a selector that resolves to exactly one element, even with a structurally identical non-sibling subtree", async () => {
    const counts = await withPage(async (page) => {
      await page.goto(repeatedFixture);
      const regions = await collectRegions(page);
      return page.evaluate(
        (selectors) => selectors.map((selector) => document.querySelectorAll(selector).length),
        regions.map((r) => r.selector),
      );
    });
    expect(counts.every((n) => n === 1)).toBe(true);
  });

  it("never produces duplicate selectors, even with a structurally identical non-sibling subtree", async () => {
    const regions = await withPage(async (page) => {
      await page.goto(repeatedFixture);
      return collectRegions(page);
    });
    const selectors = regions.map((r) => r.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
  });
});

describe("cropRegions", () => {
  async function pickThree(page) {
    await page.goto(fixture);
    const all = await collectRegions(page);
    return [
      all.find((r) => r.classes.includes("card")),
      all.find((r) => r.tag === "form"),
      all.find((r) => r.classes.includes("row")),
    ];
  }

  it("writes exactly r1..r3 in order, matching the returned paths", async () => {
    const outDir = await makeTmpDir();
    const written = await withPage(async (page) => {
      const regions = await pickThree(page);
      return cropRegions(page, regions, outDir);
    });

    expect(written).toEqual([
      path.join(outDir, "r1.png"),
      path.join(outDir, "r2.png"),
      path.join(outDir, "r3.png"),
    ]);
    expect((await fs.readdir(outDir)).sort()).toEqual(["r1.png", "r2.png", "r3.png"]);
  });

  it("removes stale higher-numbered crops when a later run writes fewer regions", async () => {
    const outDir = await makeTmpDir();
    await withPage(async (page) => {
      const regions = await pickThree(page);
      await cropRegions(page, regions, outDir);
    });

    await withPage(async (page) => {
      await page.goto(fixture);
      const all = await collectRegions(page);
      const one = [all.find((r) => r.classes.includes("card"))];
      await cropRegions(page, one, outDir);
    });

    expect((await fs.readdir(outDir)).sort()).toEqual(["r1.png"]);
  });

  it("never touches files in outDir that don't match rN.png", async () => {
    const outDir = await makeTmpDir();
    await fs.writeFile(path.join(outDir, "notes.txt"), "keep me");

    await withPage(async (page) => {
      const one = [(await pickThree(page))[0]];
      await cropRegions(page, one, outDir);
    });

    expect((await fs.readdir(outDir)).sort()).toEqual(["notes.txt", "r1.png"]);
  });

  // D3 (task 15): `page.screenshot({ clip })` without `fullPage: true` resolves
  // the clip against the viewport, so a candidate whose box starts below 900px
  // threw a raw Playwright stack — killing both long-document mockups outright.
  it("crops a candidate that sits entirely below the fold", async () => {
    const outDir = await makeTmpDir();
    const { written, region } = await withPage(async (page) => {
      await page.goto(tallFixture);
      const regions = await collectRegions(page);
      const region = regions.find((r) => r.classes.includes("below-fold"));
      const written = await cropRegions(page, [region], outDir);
      return { written, region };
    });

    expect(region.box.y).toBeGreaterThan(900);
    const png = PNG.sync.read(await fs.readFile(written[0]));
    expect(png.width).toBe(Math.round(region.box.w * DEVICE_SCALE_FACTOR));
    expect(png.height).toBe(Math.round(region.box.h * DEVICE_SCALE_FACTOR));
  });

  // The crash was the cheap half. The expensive half is cropping the WRONG
  // rectangle: a preview that lies is worse than a preview that fails. The
  // fixture's below-fold box is flat #ff00ff and nothing else on the page is,
  // so one pixel out of the middle settles which rectangle was taken.
  it("crops the rectangle the region actually names, not the same-sized one at the top of the page", async () => {
    const outDir = await makeTmpDir();
    const written = await withPage(async (page) => {
      await page.goto(tallFixture);
      const regions = await collectRegions(page);
      return cropRegions(page, [regions.find((r) => r.classes.includes("below-fold"))], outDir);
    });

    const png = PNG.sync.read(await fs.readFile(written[0]));
    const middle = (png.height / 2) * (png.width * 4) + (png.width / 2) * 4;
    expect([png.data[middle], png.data[middle + 1], png.data[middle + 2]]).toEqual([255, 0, 255]);
  });

  it("pairs each PNG with its own region — dimensions match box × DEVICE_SCALE_FACTOR", async () => {
    const outDir = await makeTmpDir();
    const { written, regions } = await withPage(async (page) => {
      const regions = await pickThree(page);
      const written = await cropRegions(page, regions, outDir);
      return { written, regions };
    });

    for (const [index, region] of regions.entries()) {
      const buf = await fs.readFile(written[index]);
      const png = PNG.sync.read(buf);
      expect(png.width).toBe(Math.round(region.box.w * DEVICE_SCALE_FACTOR));
      expect(png.height).toBe(Math.round(region.box.h * DEVICE_SCALE_FACTOR));
    }
  });
});
