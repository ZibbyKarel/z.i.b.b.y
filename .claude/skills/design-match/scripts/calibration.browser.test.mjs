import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { withPage } from "./browser.mjs";
import { flattenValues } from "./cli.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { compareValues } from "./compare-values.mjs";
import { extractRaw } from "./extract.mjs";
import { normalizeSkeleton } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => pathToFileURL(path.join(dir, "fixtures", name)).href;

// withPage launches and closes a fresh Chromium per call. Each fixture is only ever
// measured once per layer — memoised by name — so three tests share five browser
// launches instead of paying for one per skeletonOf/shotOf call site.
//
// The cache stores the in-flight promise, including a rejection: a Chromium launch
// failure in one test replays into every later test that shares the same fixture
// name, presenting one flake as several correlated failures. Accepted here — inputs
// are deterministic local fixtures, so a retry would not help — but worth knowing if
// two "unrelated" tests ever fail together.
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
    // ...but the two fixtures differ only in class names and render identically, so
    // the honest bound is exact zero — 0.49% drift would pass the line above and
    // still be invisible to this calibration. `percent` alone isn't proof of that:
    // pixels.mjs rounds it to two decimals, so up to nine differing pixels at this
    // resolution would still read as 0. `largestRegion` is the unrounded oracle —
    // diffPngs only sets it to {0,0} when the differing-pixel count is truly zero.
    expect(verdict.percent).toBe(0);
    expect(verdict.largestRegion).toEqual({ w: 0, h: 0 });
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
    expect(formFinding.message).toContain("grid");
    expect(formFinding.message).toContain("flex-column");
  });

  it("compares VALUES on the same nodes the gate passed — nothing reported missing", async () => {
    // The test whose absence let the Critical ship. Two fixtures that render
    // byte-identically but share no class name at all: the gate passes (test 1),
    // and before Task 13c the value layer then reported EVERY node as
    // `__missing__`, because it walked the DOM a second time and keyed its paths
    // off class-derived roles. "Passing structure, everything missing" is a
    // falsehood handed to the coding agent — worse than saying nothing.
    const design = await skeletonOf("basic.html");
    const app = await skeletonOf("calibration-good.html");

    // The rename is load-bearing: the two sides really do infer different
    // readable roles, so a per-tree path lookup would still not line up. Only
    // the lockstep walk makes them agree.
    expect(design.role).toBe("card");
    expect(app.role).toBe("group");
    expect(Object.keys(flattenValues(design))).not.toEqual(Object.keys(flattenValues(app)));

    const deltas = compareValues(design, app);
    expect(deltas.filter((d) => d.prop === "__missing__")).toEqual([]);
    // Stronger, and the honest bound: the two fixtures differ only in class
    // names and render identically, so there is no value difference at all.
    expect(deltas).toEqual([]);
  });
});
