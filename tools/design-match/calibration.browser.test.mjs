import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { extractRaw } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => pathToFileURL(path.join(dir, "fixtures", name)).href;

// withPage launches and closes a fresh Chromium per call. Each fixture is only ever
// measured once per layer — memoised by name — so three tests share five browser
// launches instead of paying for one per skeletonOf/shotOf call site.
const skeletonCache = new Map();
const shotCache = new Map();

async function skeletonOf(name) {
  if (!skeletonCache.has(name)) {
    skeletonCache.set(
      name,
      withPage(async (page) => {
        await page.goto(fixture(name));
        return normalizeSkeleton(await extractRaw(page, '[data-region="card"]'));
      }),
    );
  }
  return skeletonCache.get(name);
}

async function shotOf(name) {
  if (!shotCache.has(name)) {
    shotCache.set(
      name,
      withPage(async (page) => {
        await page.goto(fixture(name));
        return page.locator('[data-region="card"]').screenshot();
      }),
    );
  }
  return shotCache.get(name);
}

describe("calibration", () => {
  it("passes the gate for a structurally identical implementation", async () => {
    const verdict = compareSkeletons(
      await skeletonOf("basic.html"),
      await skeletonOf("calibration-good.html"),
    );
    expect(verdict.findings).toEqual([]);
    expect(verdict.pass).toBe(true);
  });

  it("measures zero residual pixel noise between the two matching fixtures", async () => {
    const verdict = diffPngs(await shotOf("basic.html"), await shotOf("calibration-good.html"));
    // Certifies the loop's own done-threshold (DONE_PERCENT) is reachable...
    expect(verdict.percent).toBeLessThan(0.5);
    // ...but the two fixtures differ only in class/data-role names and render
    // identically, so the honest bound is exact zero — 0.49% drift would pass
    // the line above and still be invisible to this calibration.
    expect(verdict.percent).toBe(0);
  });

  it("REJECTS a grid form rebuilt as a stacked flex column", async () => {
    const verdict = compareSkeletons(
      await skeletonOf("basic.html"),
      await skeletonOf("calibration-bad.html"),
    );
    expect(verdict.pass).toBe(false);

    // Pinned to the form node itself, not "a layout-mode finding anywhere": the
    // failure this fixture encodes is specific (the form's grid became a stacked
    // column), and a change that stopped comparing the form node would otherwise
    // keep this test green as long as some other node tripped layout-mode.
    const formFinding = verdict.findings.find(
      (f) => f.kind === "layout-mode" && f.path === "card/form[0]",
    );
    expect(formFinding).toBeDefined();
    expect(formFinding?.message).toContain("grid");
    expect(formFinding?.message).toContain("flex-column");
  });
});
