import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_SCALE_FACTOR, VIEWPORT, withPage } from "./browser.mjs";
import { diffPngs } from "./pixels.mjs";
import { shootScene } from "./shoot.mjs";

const fixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "basic.html"),
).href;

let tmpDirs = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-shoot-"));
  tmpDirs.push(dir);
  return dir;
}

describe("shootScene", () => {
  it("screenshots the scene's selector, not the whole page — dimensions match the element's box × DEVICE_SCALE_FACTOR", async () => {
    const outDir = await makeTmpDir();
    const outPath = path.join(outDir, "shot.png");
    const scene = { mode: "route", url: fixture, selector: ".card", masks: [] };

    const { buffer, box } = await withPage(async (page) => {
      const buffer = await shootScene(page, scene, outPath);
      const box = await page.locator(".card").boundingBox();
      return { buffer, box };
    });

    const png = PNG.sync.read(buffer);
    expect(png.width).toBe(Math.round(box.width * DEVICE_SCALE_FACTOR));
    expect(png.height).toBe(Math.round(box.height * DEVICE_SCALE_FACTOR));

    // The .card fixture element is far smaller than the viewport — proves this
    // is a cropped element shot, not an accidental full-page capture.
    expect(png.width).toBeLessThan(VIEWPORT.width * DEVICE_SCALE_FACTOR);
    expect(png.height).toBeLessThan(VIEWPORT.height * DEVICE_SCALE_FACTOR);
  });

  it("writes the screenshot to the given outPath", async () => {
    const outDir = await makeTmpDir();
    const outPath = path.join(outDir, "shot.png");
    const scene = { mode: "route", url: fixture, selector: ".card", masks: [] };

    const buffer = await withPage((page) => shootScene(page, scene, outPath));

    const onDisk = await fs.readFile(outPath);
    expect(onDisk.equals(buffer)).toBe(true);
  });

  it("a supplied mask changes the output pixels versus an unmasked shot of the same scene", async () => {
    const outDir = await makeTmpDir();
    const unmaskedPath = path.join(outDir, "unmasked.png");
    const maskedPath = path.join(outDir, "masked.png");

    const unmaskedScene = { mode: "route", url: fixture, selector: ".card", masks: [] };
    const maskedScene = { mode: "mask", url: fixture, selector: ".card", masks: [".row"] };

    const unmaskedBuffer = await withPage((page) => shootScene(page, unmaskedScene, unmaskedPath));
    const maskedBuffer = await withPage((page) => shootScene(page, maskedScene, maskedPath));

    const verdict = diffPngs(unmaskedBuffer, maskedBuffer);
    expect(verdict.percent).toBeGreaterThan(0);
  });
});
