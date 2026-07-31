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

const animatedFixture = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "animated.html"),
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

  // Fix round 1, Important 1: a mask selector matching nothing used to be a
  // silent no-op — Playwright draws nothing and raises nothing. The region the
  // operator believed was masked shipped fully unmasked into the comparison.
  it("rejects when a mask selector matches no element, naming the selector", async () => {
    const outDir = await makeTmpDir();
    const outPath = path.join(outDir, "shot.png");
    const scene = {
      mode: "mask",
      url: fixture,
      selector: ".card",
      masks: [".does-not-exist"],
    };

    await expect(withPage((page) => shootScene(page, scene, outPath))).rejects.toThrow(
      /\.does-not-exist/,
    );
  });

  // Fix round 1, Important 2: target.screenshot() crops to scene.selector, so a
  // mask locator resolving entirely outside that box masks nothing in the
  // output — equally silent as Important 1. Built from the existing basic.html
  // fixture without touching it: shoot one .row and mask a sibling .row: the
  // grid layout puts them side by side, so they never intersect.
  it("rejects when a mask lies entirely outside the shot region, naming the selector", async () => {
    const outDir = await makeTmpDir();
    const outPath = path.join(outDir, "shot.png");
    const scene = {
      mode: "mask",
      url: fixture,
      selector: ".form .row:nth-child(1)",
      masks: [".form .row:nth-child(2)"],
    };

    await expect(withPage((page) => shootScene(page, scene, outPath))).rejects.toThrow(
      /\.form \.row:nth-child\(2\)/,
    );
  });

  // Fix round 1, Important 3: without `animations: "disabled"`, a continuous
  // CSS animation can be caught mid-frame, and two shots of the same scene can
  // land on different frames — a pixel delta naming no real cause. Proven
  // behaviourally: the same scene shot twice must be byte-identical.
  it("shoots a continuously animated scene byte-identically twice in a row", async () => {
    const outDir = await makeTmpDir();
    const firstPath = path.join(outDir, "first.png");
    const secondPath = path.join(outDir, "second.png");
    const scene = { mode: "route", url: animatedFixture, selector: ".viewport", masks: [] };

    const firstBuffer = await withPage((page) => shootScene(page, scene, firstPath));
    const secondBuffer = await withPage((page) => shootScene(page, scene, secondPath));

    expect(firstBuffer.equals(secondBuffer)).toBe(true);
  });
});
