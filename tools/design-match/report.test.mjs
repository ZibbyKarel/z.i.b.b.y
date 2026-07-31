import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_ROUNDS, describeOutcome } from "./loop.mjs";
import {
  compositeDiff,
  renderComponents,
  renderReport,
  renderSkeleton,
  renderTokens,
  renderValues,
  writeArtifacts,
} from "./report.mjs";

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      const [r, g, b, a] = paint(x, y);
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }
  return PNG.sync.write(image);
}

describe("renderSkeleton", () => {
  it("reports a passing skeleton as sedí", () => {
    expect(renderSkeleton([])).toContain("Sedí");
    expect(renderSkeleton([])).not.toContain("MISMATCH");
  });

  it("renders each finding under its path heading", () => {
    const out = renderSkeleton([
      { path: "form", kind: "layout-mode", message: "grid vs flex-column" },
    ]);
    expect(out).toContain("SKELETON MISMATCH");
    expect(out).toContain("`form`");
    expect(out).toContain("**layout-mode** — grid vs flex-column");
  });
});

describe("renderValues", () => {
  // The stale-warning guard: values.md and skeleton.md now report one address
  // space, so any surviving text telling a reader the two are unrelated would
  // make them distrust paths that are finally trustworthy.
  const PATH_SPACE_WARNING = /adresní prostor|extractValues/;

  it("reports no deltas as sedí, with no path-space warning left over", () => {
    const out = renderValues([]);
    expect(out).toContain("Sedí");
    expect(out).not.toMatch(PATH_SPACE_WARNING);
  });

  it("groups deltas by path, still with no path-space warning", () => {
    const out = renderValues([
      {
        path: "card/row[0]",
        prop: "gap",
        expected: "16px",
        actual: "12px",
        message: "gap 16 vs 12",
      },
      {
        path: "card/row[0]",
        prop: "color",
        expected: "red",
        actual: "blue",
        message: "color red vs blue",
      },
      { path: "form", prop: "width", expected: "100%", actual: "80%", message: "width 100 vs 80" },
    ]);
    expect(out).toContain("`card/row[0]`");
    expect(out).toContain("**gap** — gap 16 vs 12");
    expect(out).toContain("**color** — color red vs blue");
    expect(out).toContain("`form`");
    expect(out).toContain("**width** — width 100 vs 80");
    expect(out).not.toMatch(PATH_SPACE_WARNING);
  });

  // Silence that means "verified" and silence that means "never looked" must not
  // render identically — the same line this tool already holds for masked
  // regions, which report.md always lists as unchecked area. A collapsed
  // pass-through wrapper is not measured at all, and a wrapper is exactly the
  // kind of node that carries a background colour.
  describe("collapsed-wrapper coverage note", () => {
    const deltas = [
      { path: "card", prop: "gap", expected: "16px", actual: "12px", message: "gap 16 vs 12" },
    ];

    it("names the unmeasured area even when there are NO differences to report", () => {
      // The case where a reader is most likely to read "Sedí" as "everything was
      // checked" — so this is the case the note matters most in.
      const out = renderValues([], { wrappersCollapsed: true });
      expect(out).toContain("Sedí");
      expect(out).toContain("Průchozí obaly");
      expect(out).toContain("měřené nejsou");
      expect(out).toContain("--strict-wrappers");
    });

    it("names the unmeasured area alongside real deltas too", () => {
      const out = renderValues(deltas, { wrappersCollapsed: true });
      expect(out).toContain("**gap** — gap 16 vs 12");
      expect(out).toContain("--strict-wrappers");
    });

    it("omits the note under --strict-wrappers, where nothing was collapsed", () => {
      expect(renderValues([], { wrappersCollapsed: false })).not.toContain("--strict-wrappers");
      expect(renderValues(deltas, { wrappersCollapsed: false })).not.toContain("--strict-wrappers");
    });

    it("defaults to showing the note, matching the tool's default of collapsing", () => {
      // Erring toward naming unmeasured area is the safe direction: a caller
      // that forgets to say gets the caveat, not silent false reassurance.
      expect(renderValues([])).toContain("--strict-wrappers");
    });
  });

  // Defect 1 (task 14b): on a red-skeleton round, compareValues is never
  // called — `null` means that, `[]` means it ran and found nothing. Before
  // this fix, `buildCompareOutcome` laundered null into [] and this file
  // rendered both identically as "Sedí — žádné hodnotové rozdíly", a positive
  // false claim rather than mere silence.
  describe("not compared (skeleton gate failed)", () => {
    it("renders differently from the genuine no-deltas case", () => {
      const notCompared = renderValues(null);
      const noDeltas = renderValues([]);
      expect(notCompared).not.toEqual(noDeltas);
      expect(notCompared).not.toContain("Sedí");
      expect(noDeltas).toContain("Sedí");
    });

    it("says why, pointing at the skeleton gate", () => {
      const out = renderValues(null);
      expect(out).toContain("Neměřeno");
      expect(out).toMatch(/skeleton/i);
    });

    it("omits the wrapper-coverage note — nothing was measured for any reason", () => {
      expect(renderValues(null, { wrappersCollapsed: true })).not.toContain("--strict-wrappers");
    });
  });

  // Fix round 1, M1: the removed `?? []` in cli.mjs used to absorb `undefined`
  // the same way it absorbed `null` — a caller-contract violation (a payload
  // missing the `values` key entirely) must not fall through and get rendered
  // as "not measured" (that names the skeleton gate as the cause, which may
  // not even be true for whatever produced the malformed payload); it must
  // fail loudly, the same clean one-line way every other usage error in this
  // tool does.
  it("throws a design-match:-prefixed error for undefined (a payload missing `values` entirely), never renders it", () => {
    expect(() => renderValues(undefined)).toThrow(/^design-match:/);
  });
});

describe("renderTokens", () => {
  it("renders an empty table with no rows", () => {
    const out = renderTokens([]);
    expect(out).toContain("# Mapování tokenů");
    expect(out.trim().split("\n")).toHaveLength(4);
  });

  it("renders exact and new mappings differently", () => {
    const out = renderTokens([
      { value: "#0a0a0a", mapping: { kind: "exact", token: "--zt-fg-1" } },
      {
        value: "#123456",
        mapping: { kind: "new", nearest: "--zt-fg-2", distance: 4.2, proposedName: "--zt-fg-hero" },
      },
    ]);
    expect(out).toContain("| `#0a0a0a` | `--zt-fg-1` | — | 0 |");
    expect(out).toContain("| `#123456` | **nový** `--zt-fg-hero` | `--zt-fg-2` | 4.2 |");
  });
});

describe("renderComponents", () => {
  it("renders no decisions as an empty body under the heading", () => {
    const out = renderComponents([]);
    expect(out.trim()).toBe("# Volba komponent");
  });

  it("renders a decision with rejected candidates and one without any", () => {
    const out = renderComponents([
      {
        path: "form/action[0]",
        chosen: "Button",
        rejected: [{ component: "IconButton", reason: "chybí label" }],
      },
      { path: "form/input[0]", chosen: "TextInput", rejected: [] },
    ]);
    expect(out).toContain("`form/action[0]` → Button");
    expect(out).toContain("`IconButton` zamítnut — chybí label");
    expect(out).toContain("`form/input[0]` → TextInput");
    expect(out).toContain("žádný existující DS kandidát nebyl zvažován");
  });
});

describe("renderReport", () => {
  it("renders HOTOVO when the final round's status is done, regardless of the stop flag", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 0.3, skeletonPass: true, reason: "diff 0.3 %" }],
      verdict: { stop: true, status: "done", reason: "diff 0.3 %, největší region 2×2" },
      masks: [],
    });
    expect(out).toContain("**Výsledek:** HOTOVO");
    expect(out).not.toContain("PARK");
  });

  it("renders PARK when the final round's status is continue or stop", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8, skeletonPass: true, reason: "diff 8 %" }],
      verdict: { stop: true, status: "continue", reason: "strop 5 kol vyčerpán" },
      masks: ["form/input[2]"],
    });
    expect(out).toContain("**Výsledek:** PARK — strop 5 kol vyčerpán");
    expect(out).toContain("## Maskované regiony");
    expect(out).toContain("`form/input[2]`");
  });

  /*
   * D12 (task 19). Both passing branches of the font preflight computed a message
   * nothing read, so a clean `compare` gave the operator no way to know the check
   * had run at all — the same silence a red gate produces, meaning something
   * completely different. The section is the record that the layer ran, per round,
   * in the layer's own words.
   */
  it("records what each preflight said, so a passing check is not silence", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [
        {
          percent: 0.3,
          skeletonPass: true,
          reason: "diff 0.3 %",
          preflights: [
            { name: "písma", ok: true, message: "font stack shodný v první rodině: Geist" },
            { name: "rozměry snímků", ok: true, message: "rozměry snímků sedí: 800×600 px" },
          ],
        },
      ],
      verdict: { stop: false, status: "done", reason: "diff 0.3 %" },
      masks: [],
    });
    expect(out).toContain("## Preflighty");
    expect(out).toContain("font stack shodný v první rodině: Geist");
    expect(out).toContain("rozměry snímků sedí: 800×600 px");
    // Attributed to its round, because report.md renders the whole accumulated
    // history and an unattributed line would read as a claim about all of it.
    expect(out).toContain("kolo 1");
  });

  /*
   * `preflights` is absent on every round written before this field existed, and
   * `rounds.json` is replayed. Absent is a THIRD state — not "they passed" and not
   * "they did not run" — so it renders as neither, the same rule `settled` follows.
   */
  it("says nothing about preflights for a round that predates the field", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8, skeletonPass: true, reason: "diff 8 %" }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).not.toContain("Preflighty");
  });

  // D4 (task 15): a round that exits 1 — the normal "keep going" case — used to
  // write `Výsledek: PARK` into the one file SKILL.md tells the operator to read
  // first. The rendered verdict contradicted the exit code the driving agent was
  // acting on, so a driver following the documentation abandoned the loop on
  // round 1 of every run.
  it("renders POKRAČUJ, not PARK, for a round that is still continuing", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8, skeletonPass: false, reason: "skeleton gate neprošel" }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).toContain("**Výsledek:** POKRAČUJ — pokračuje");
    expect(out).not.toContain("PARK");
  });

  // The headline must be looked up from the same table the exit code comes from,
  // not from a second list of strings that can drift. Driven over every outcome
  // the CLI can produce.
  it("labels the headline with exactly describeOutcome's label, for every outcome", () => {
    const verdicts = [
      { stop: false, status: "done", reason: "hotovo" },
      { stop: false, status: "continue", reason: "pokračuje" },
      { stop: true, status: "continue", reason: "strop kol vyčerpán" },
      { stop: true, status: "parked", reason: "font stack se liší" },
      { stop: true, status: "error", reason: "spec.json chybí" },
    ];
    for (const verdict of verdicts) {
      const out = renderReport({ slug: "s", rounds: [{ percent: null }], verdict, masks: [] });
      expect(out).toContain(`**Výsledek:** ${describeOutcome(verdict).label} — ${verdict.reason}`);
    }
  });

  // A continuing round has to say what the driver does next, and where it sits
  // against the ceiling. Round MAX_ROUNDS runs fully and writes its artifacts
  // before parking, so POKRAČUJ can only ever be seen on MAX_ROUNDS - 1 rounds.
  it("tells a continuing driver to re-invoke, and names the round against MAX_ROUNDS", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8 }, { percent: 5 }, { percent: 3 }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).toContain(`Kolo 3 z ${MAX_ROUNDS}`);
    expect(out).toContain("compare");
    expect(out).toContain(`${MAX_ROUNDS - 1}`);
  });

  /*
   * Fix round 1, I3. `gotoSettled` returns `{ settled }` and warns on stderr,
   * and both call sites threw the flag away — so the only trace that a page had
   * been photographed mid-load lived in an ephemeral console line. report.md is
   * the artifact the driver and the operator actually read, and by this task's
   * own headline finding EVERY `--route` compare against this repo's web app
   * runs unsettled: a pixel percentage stated with no record that the page had
   * not finished loading is exactly the confident-claim-it-cannot-back failure
   * the whole branch exists to remove. Files are the source of truth.
   */
  it("marks the round whose page was still loading when it was photographed", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 4, skeletonPass: true, reason: "diff 4 %", settled: false }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).toContain("neustálila");
  });

  it("says nothing about settling for a round that was settled", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 4, skeletonPass: true, reason: "diff 4 %", settled: true }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).not.toContain("neustálila");
  });

  // A round replayed from a rounds.json written before the flag existed carries
  // no `settled` at all. Unknown is not the same fact as settled, and it is not
  // the same fact as unsettled either — so it claims neither.
  it("claims nothing about a round that predates the flag", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 4, skeletonPass: true, reason: "diff 4 %" }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    });
    expect(out).not.toContain("neustálila");
  });

  // The design side is measured once, rounds earlier, by a different command —
  // so its own settle has to travel in spec.json and be surfaced here, or a
  // report can state a pixel delta against a design.png nobody knows was shot
  // mid-load.
  it("says when design.png itself was shot on a page that never settled", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 4, skeletonPass: true, reason: "diff 4 %", settled: true }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
      designSettled: false,
    });
    expect(out).toContain("design.png");
    expect(out).toContain("neustálila");
  });

  it("says nothing about the design's settle when it settled, or when it is unknown", () => {
    const base = {
      slug: "roadmap",
      rounds: [{ percent: 4, skeletonPass: true, reason: "diff 4 %", settled: true }],
      verdict: { stop: false, status: "continue", reason: "pokračuje" },
      masks: [],
    };
    expect(renderReport({ ...base, designSettled: true })).not.toContain("design.png");
    expect(renderReport(base)).not.toContain("design.png");
  });

  /*
   * Fix round 1, M8. History is replayed and appended, so a driver that keeps
   * calling `compare` past the ceiling produces `rounds.length > MAX_ROUNDS` and
   * the counter read "Kolo 6 z 5" — a sentence that describes nothing. The
   * verdict is correctly PARK either way; only the counter was nonsense.
   */
  it("does not read 'Kolo 6 z 5' once the driver has run past the ceiling", () => {
    const rounds = Array.from({ length: MAX_ROUNDS + 1 }, () => ({ percent: 8 }));
    const out = renderReport({
      slug: "roadmap",
      rounds,
      verdict: { stop: true, status: "continue", reason: "strop kol vyčerpán" },
      masks: [],
    });
    expect(out).not.toContain(`Kolo ${MAX_ROUNDS + 1} z ${MAX_ROUNDS}`);
    expect(out).toContain(`${MAX_ROUNDS + 1}`);
    expect(out).toContain(`${MAX_ROUNDS}`);
  });

  it("tells a parked driver to stop calling compare, and a done one that it is finished", () => {
    const parked = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8 }],
      verdict: { stop: true, status: "parked", reason: "font stack se liší" },
      masks: [],
    });
    expect(parked).toContain("Přestaň volat");
    const done = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 0.1 }],
      verdict: { stop: false, status: "done", reason: "diff 0.1 %" },
      masks: [],
    });
    expect(done).toContain("Přestaň volat");
    expect(done).not.toContain("Uprav implementaci");
  });

  it("omits the masks section entirely when there are none", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
    });
    expect(out).not.toContain("Maskované regiony");
  });

  it("names a round's diff-image failure inline in its bullet (fix round 1, Important 1)", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [
        { percent: 4, skeletonPass: true, reason: "kolo 1" },
        {
          percent: 0.3,
          skeletonPass: true,
          reason: "kolo 2",
          diffImageError: "design-match: rozměry se liší — app 4×4, maska 6×4",
        },
      ],
      verdict: { stop: true, status: "continue", reason: "diff obrázek chybí pro kolo 2" },
      masks: [],
    });
    expect(out).toContain("kolo 2");
    expect(out).toContain("diff obrázek chybí");
    expect(out).toContain("app 4×4, maska 6×4");
    // round 1 has no diffImageError, so its bullet must not carry the note
    expect(out.split("\n").find((line) => line.includes("kolo 1"))).not.toContain(
      "diff obrázek chybí",
    );
  });

  it("lists only the sibling files actually supplied, under their own section (fix round 1, Minor 2)", () => {
    const withFiles = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
      siblingFiles: ["skeleton.md", "values.md", "round-1.json"],
    });
    expect(withFiles).toContain("## Doprovodné soubory");
    expect(withFiles).toContain("`skeleton.md`");
    expect(withFiles).toContain("`values.md`");
    expect(withFiles).toContain("`round-1.json`");
    expect(withFiles).not.toContain("spec.json");

    const withoutFiles = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
    });
    expect(withoutFiles).not.toContain("Doprovodné soubory");
  });
});

describe("compositeDiff", () => {
  it("leaves the app image byte-identical when the mask is fully transparent", () => {
    const app = png(6, 6, () => [10, 20, 30, 255]);
    const mask = png(6, 6, () => [255, 0, 0, 0]);
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    const appPng = PNG.sync.read(app);
    expect(Buffer.compare(outPng.data, appPng.data)).toBe(0);
  });

  it("shows an opaque mask pixel at its exact coordinate, leaving the rest untouched", () => {
    const app = png(6, 6, () => [0, 0, 0, 255]);
    const mask = png(6, 6, (x, y) => (x === 2 && y === 3 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    const hit = (2 + 6 * 3) << 2;
    expect([outPng.data[hit], outPng.data[hit + 1], outPng.data[hit + 2]]).toEqual([255, 0, 0]);
    const untouched = (0 + 6 * 0) << 2;
    expect([
      outPng.data[untouched],
      outPng.data[untouched + 1],
      outPng.data[untouched + 2],
    ]).toEqual([0, 0, 0]);
  });

  it("does not mutate the app buffer passed in", () => {
    const app = png(4, 4, () => [1, 2, 3, 255]);
    const appCopy = Buffer.from(app);
    const mask = png(4, 4, () => [255, 255, 255, 128]);
    compositeDiff(app, mask);
    expect(Buffer.compare(app, appCopy)).toBe(0);
  });

  it("throws when dimensions differ, naming both", () => {
    const app = png(10, 10, () => [0, 0, 0, 255]);
    const mask = png(12, 10, () => [0, 0, 0, 255]);
    expect(() => compositeDiff(app, mask)).toThrow(/10×10.*12×10/);
  });

  it("blends a partial-alpha mask pixel arithmetically, not just short-circuiting on 0/255 (Minor 1)", () => {
    // app channel 0, mask channel 255, alpha 128 -> a = 128/255, so
    // mask*a + app*(1-a) = 255*(128/255) + 0 = 128 exactly: a clean value that
    // only comes out right if the interpolation itself is correct.
    const app = png(2, 2, () => [0, 0, 0, 255]);
    const mask = png(2, 2, () => [255, 255, 255, 128]);
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    expect([outPng.data[0], outPng.data[1], outPng.data[2], outPng.data[3]]).toEqual([
      128, 128, 128, 255,
    ]);
  });
});

describe("writeArtifacts", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-report-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("carries the run's strictWrappers setting into values.md's coverage note", async () => {
    const payload = {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      rounds: [{ percent: 0, skeletonPass: true, reason: "kolo 1" }],
    };

    await writeArtifacts(dir, { ...payload, strictWrappers: false });
    expect(await fs.readFile(path.join(dir, "values.md"), "utf8")).toContain("--strict-wrappers");

    await writeArtifacts(dir, { ...payload, strictWrappers: true });
    expect(await fs.readFile(path.join(dir, "values.md"), "utf8")).not.toContain(
      "--strict-wrappers",
    );
  });

  it("writes values.md as not-measured, not sedí, when the skeleton gate failed (payload.values is null)", async () => {
    await writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [{ path: "form", kind: "layout-mode", message: "grid vs flex-column" }],
      values: null,
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "parked", reason: "skeleton gate neprošel" },
      rounds: [{ percent: null, skeletonPass: false, reason: "skeleton mismatch" }],
    });
    const valuesMd = await fs.readFile(path.join(dir, "values.md"), "utf8");
    expect(valuesMd).toContain("Neměřeno");
    expect(valuesMd).not.toContain("Sedí");
  });

  it("writes exactly the expected file set, including a diff png only for rounds that carry buffers", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await writeArtifacts(dir, {
      slug: "roadmap",
      spec: { threshold: 0.5 },
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      rounds: [
        { percent: 4, skeletonPass: true, reason: "kolo 1" },
        { percent: 0.3, skeletonPass: true, reason: "kolo 2", appImage: app, maskImage: mask },
      ],
    });

    const entries = (await fs.readdir(dir)).sort();
    expect(entries).toEqual(
      [
        "skeleton.md",
        "values.md",
        "tokens.md",
        "components.md",
        "report.md",
        "spec.json",
        "round-1.json",
        "round-2.json",
        "round-2-diff.png",
      ].sort(),
    );

    const round1 = JSON.parse(await fs.readFile(path.join(dir, "round-1.json"), "utf8"));
    expect(round1).toEqual({ percent: 4, skeletonPass: true, reason: "kolo 1" });
    const round2 = JSON.parse(await fs.readFile(path.join(dir, "round-2.json"), "utf8"));
    expect(round2).toEqual({ percent: 0.3, skeletonPass: true, reason: "kolo 2" });

    const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
    expect(report).toContain("HOTOVO");
  });

  it("skips spec.json when payload.spec is absent, without throwing", async () => {
    await writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "continue", reason: "strop 5 kol vyčerpán" },
      rounds: [{ percent: 8, skeletonPass: true, reason: "kolo 1" }],
    });

    const entries = await fs.readdir(dir);
    expect(entries).not.toContain("spec.json");
    expect(entries).not.toContain("round-1-diff.png");
    expect(entries).toContain("round-1.json");
  });

  it("lists its own sibling files in report.md, excluding files this run never wrote", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      rounds: [
        { percent: 0.3, skeletonPass: true, reason: "kolo 1", appImage: app, maskImage: mask },
      ],
    });

    const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
    expect(report).toContain("`skeleton.md`");
    expect(report).toContain("`values.md`");
    expect(report).toContain("`tokens.md`");
    expect(report).toContain("`components.md`");
    expect(report).toContain("`round-1.json`");
    expect(report).toContain("`round-1-diff.png`");
    expect(report).not.toContain("spec.json");
  });

  it(
    "collects one round's composite failure without stopping the others, writes the complete " +
      "file set with the failure named in it, then rejects naming the affected round " +
      "(fix round 1, Important 1)",
    async () => {
      const goodApp = png(4, 4, () => [0, 0, 0, 255]);
      const goodMask = png(4, 4, () => [255, 0, 0, 255]);
      const badApp = png(4, 4, () => [0, 0, 0, 255]);
      const badMask = png(6, 4, () => [255, 0, 0, 255]);

      const attempt = writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        masks: [],
        verdict: { stop: true, status: "continue", reason: "diff obrázek chybí pro kolo 2" },
        rounds: [
          {
            percent: 0.3,
            skeletonPass: true,
            reason: "kolo 1",
            appImage: goodApp,
            maskImage: goodMask,
          },
          {
            percent: 4,
            skeletonPass: true,
            reason: "kolo 2",
            appImage: badApp,
            maskImage: badMask,
          },
        ],
      });

      await expect(attempt).rejects.toThrow(/kolo 2|round 2|2/);

      const entries = (await fs.readdir(dir)).sort();
      expect(entries).toEqual(
        [
          "skeleton.md",
          "values.md",
          "tokens.md",
          "components.md",
          "report.md",
          "round-1.json",
          "round-1-diff.png",
          "round-2.json",
        ].sort(),
      );
      expect(entries).not.toContain("round-2-diff.png");

      const round2 = JSON.parse(await fs.readFile(path.join(dir, "round-2.json"), "utf8"));
      expect(round2.diffImageError).toMatch(/4×4.*6×4/);

      const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
      expect(report).toContain("kolo 2");
      expect(report).toMatch(/diff obrázek/i);
      expect(report).toContain("4×4");
      expect(report).toContain("6×4");
    },
  );

  it("the all-good path still writes exactly the file set it wrote before, and does not throw", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await expect(
      writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        masks: [],
        verdict: { stop: true, status: "done", reason: "ok" },
        rounds: [
          { percent: 4, skeletonPass: true, reason: "kolo 1" },
          { percent: 0.3, skeletonPass: true, reason: "kolo 2", appImage: app, maskImage: mask },
        ],
      }),
    ).resolves.toBeUndefined();

    const entries = (await fs.readdir(dir)).sort();
    expect(entries).toEqual(
      [
        "skeleton.md",
        "values.md",
        "tokens.md",
        "components.md",
        "report.md",
        "round-1.json",
        "round-2.json",
        "round-2-diff.png",
      ].sort(),
    );
  });

  it(
    "renders everything to memory before touching disk, so a render failure leaves nothing " +
      "written (fix round 2, Important 1)",
    async () => {
      const attempt = writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        // renderReport does `masks.length` — it renders LAST of the five markdown
        // strings, so under the pre-fix ordering every other .md (and any
        // round-N.json) would already have been scheduled for writing by the
        // time this throws. Post-fix, every render happens before any write is
        // scheduled, so this must leave the directory completely empty.
        masks: null,
        verdict: { stop: true, status: "done", reason: "ok" },
        rounds: [],
      });

      await expect(attempt).rejects.toThrow();

      const entries = await fs.readdir(dir);
      expect(entries).toEqual([]);
    },
  );

  it(
    "collects a write failure without stopping the others, writes every other file, and " +
      "rejects naming the failed one (fix round 2, Important 2)",
    async () => {
      // A directory named report.md makes writeFile fail with EISDIR for that
      // one entry while every sibling write can still succeed normally.
      await fs.mkdir(path.join(dir, "report.md"));
      const app = png(4, 4, () => [0, 0, 0, 255]);
      const mask = png(4, 4, () => [255, 0, 0, 255]);

      const attempt = writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        masks: [],
        verdict: { stop: true, status: "done", reason: "ok" },
        rounds: [
          { percent: 0.3, skeletonPass: true, reason: "kolo 1", appImage: app, maskImage: mask },
        ],
      });

      await expect(attempt).rejects.toThrow(/report\.md/);

      const entries = await fs.readdir(dir);
      expect(entries).toContain("skeleton.md");
      expect(entries).toContain("values.md");
      expect(entries).toContain("tokens.md");
      expect(entries).toContain("components.md");
      expect(entries).toContain("round-1.json");
      expect(entries).toContain("round-1-diff.png");
    },
  );

  it("names both a compositing failure and a write failure in the same error when they co-occur", async () => {
    await fs.mkdir(path.join(dir, "report.md"));
    const badApp = png(4, 4, () => [0, 0, 0, 255]);
    const badMask = png(6, 4, () => [255, 0, 0, 255]);

    const attempt = writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "continue", reason: "diff obrázek chybí" },
      rounds: [
        {
          percent: 4,
          skeletonPass: true,
          reason: "kolo 1",
          appImage: badApp,
          maskImage: badMask,
        },
      ],
    });

    await expect(attempt).rejects.toThrow();
    await attempt.catch((error) => {
      expect(error.message).toContain("round-1.json");
      expect(error.message).toContain("report.md");
    });
  });
});
