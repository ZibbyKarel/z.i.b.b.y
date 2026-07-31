import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertRegionRendered,
  assertSpecMeasured,
  buildCompareOutcome,
  buildTokenMappings,
  checkFontPreflight,
  checkStrictWrappersMatch,
  collectFontStacks,
  combineVerdict,
  describeOutcome,
  flattenValues,
  historyFromRaw,
  isDeliberateError,
  loadHistory,
  parseArgs,
  planMeasureMounts,
  readSpec,
  resolveRegionIndex,
  selectExitCode,
  stripImages,
  translateNavigationError,
} from "./cli.mjs";
import { parseThemeTokens } from "./tokens.mjs";
import { DESIGN_MATCH_VERSION } from "./version.mjs";

describe("parseArgs", () => {
  it("parses the measure form", () => {
    const cmd = parseArgs(["measure", "design/x.html", "karta epicu", "--slug", "epic-card"]);
    expect(cmd).toMatchObject({
      command: "measure",
      design: "design/x.html",
      description: "karta epicu",
      slug: "epic-card",
    });
  });

  it("derives the slug from the description when not given", () => {
    expect(parseArgs(["measure", "design/x.html", "Karta Epicu"]).slug).toBe("karta-epicu");
  });

  it("parses the compare form with repeated masks", () => {
    const cmd = parseArgs([
      "compare",
      "--slug",
      "epic-card",
      "--route",
      "/roadmap",
      "--mask",
      ".a",
      "--mask",
      ".b",
    ]);
    expect(cmd).toMatchObject({
      command: "compare",
      slug: "epic-card",
      route: "/roadmap",
      masks: [".a", ".b"],
    });
  });

  it("carries the strict-wrappers knob", () => {
    expect(parseArgs(["measure", "d.html", "x", "--strict-wrappers"]).strictWrappers).toBe(true);
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/measure|compare/);
  });

  it("defaults region to 1 and parses an explicit --region as a number", () => {
    expect(parseArgs(["measure", "d.html", "x"]).region).toBe(1);
    expect(parseArgs(["measure", "d.html", "x", "--region", "3"]).region).toBe(3);
  });

  it("defaults reset to false and parses --reset for compare", () => {
    expect(parseArgs(["compare", "--slug", "s"]).reset).toBe(false);
    expect(parseArgs(["compare", "--slug", "s", "--reset"]).reset).toBe(true);
  });

  it("defaults --theme to the DS globals.css and parses an explicit override", () => {
    expect(parseArgs(["measure", "d.html", "x"]).theme).toBe(
      "libs/design-system/src/theme/globals.css",
    );
    expect(parseArgs(["measure", "d.html", "x", "--theme", "custom.css"]).theme).toBe("custom.css");
  });

  it("throws naming the flag when --theme is the last argument", () => {
    expect(() => parseArgs(["measure", "d.html", "x", "--theme"])).toThrow(/--theme/);
  });

  it("throws naming the flag when a value-taking flag has no value (--mask last)", () => {
    expect(() => parseArgs(["compare", "--slug", "s", "--mask"])).toThrow(/--mask/);
  });

  it("throws naming the flag when --slug is the last argument", () => {
    expect(() => parseArgs(["compare", "--slug"])).toThrow(/--slug/);
  });

  it("requires --slug for compare", () => {
    expect(() => parseArgs(["compare", "--route", "/roadmap"])).toThrow(/slug/);
  });

  it("requires both a design path and a description for measure", () => {
    expect(() => parseArgs(["measure"])).toThrow(/design|popis/);
    expect(() => parseArgs(["measure", "d.html"])).toThrow(/design|popis/);
  });
});

describe("resolveRegionIndex", () => {
  it("converts a 1-based region into a 0-based index", () => {
    expect(resolveRegionIndex(1, 5)).toBe(0);
    expect(resolveRegionIndex(5, 5)).toBe(4);
  });

  it("throws naming the valid range when the region is out of bounds", () => {
    expect(() => resolveRegionIndex(0, 5)).toThrow(/1.*5|5.*1/);
    expect(() => resolveRegionIndex(6, 5)).toThrow(/1.*5|5.*1/);
  });
});

describe("buildTokenMappings", () => {
  // Realistic theme-name families (matching libs/design-system/src/theme/globals.css's
  // own naming), not the --zt- role prefix PROP_PREFIX proposes new tokens
  // under — --spacing-3 and --text-sm are deliberately the same length so a
  // family mix-up is concretely reachable in these fixtures, not theoretical.
  const CSS = `
@theme {
  --color-base: #0b0e13;
  --spacing-3: 12px;
  --text-sm: 12px;
}
`;
  const tokens = parseThemeTokens(CSS);

  it("maps an exact match with no proposed name", () => {
    const values = { form: { color: "rgb(11, 14, 19)" } };
    const mappings = buildTokenMappings(values, tokens);
    expect(mappings).toEqual([
      {
        value: "rgb(11, 14, 19)",
        prop: "color",
        path: "form",
        mapping: { kind: "exact", token: "--color-base" },
      },
    ]);
    expect(mappings[0].mapping).not.toHaveProperty("proposedName");
  });

  it("does not answer a fontSize with a same-length spacing token — family filtering", () => {
    // --spacing-3 is also 12px; without filtering by the prop's own theme
    // family, mapValue's plain nearest-distance ranking picks it for a
    // fontSize just as readily as for a gap.
    const values = { form: { fontSize: "12px" } };
    expect(buildTokenMappings(values, tokens)).toEqual([
      {
        value: "12px",
        prop: "fontSize",
        path: "form",
        mapping: { kind: "exact", token: "--text-sm" },
      },
    ]);
  });

  it("does not answer a gap with a same-length text token — family filtering", () => {
    const values = { form: { gap: "12px" } };
    expect(buildTokenMappings(values, tokens)).toEqual([
      {
        value: "12px",
        prop: "gap",
        path: "form",
        mapping: { kind: "exact", token: "--spacing-3" },
      },
    ]);
  });

  it("passes an empty family-filtered candidate list straight through rather than falling back to the full token list", () => {
    // lineHeight has no theme-name family at all in the real theme (no
    // --leading-* tokens exist) — every lineHeight value must come back
    // `new` with no nearest, never matched against a token from another
    // family just because the filtered list happened to be empty.
    const values = { form: { lineHeight: "12px" } };
    expect(buildTokenMappings(values, tokens)).toEqual([
      {
        value: "12px",
        prop: "lineHeight",
        path: "form",
        mapping: { kind: "new", nearest: null, distance: null, proposedName: "--zt-leading-form" },
      },
    ]);
  });

  it("proposes a name from the leaf role (index stripped) and the prop for an unmatched value, naming a same-family nearest token", () => {
    const values = { "form/card[0]/heading[1]": { fontSize: "22px" } };
    const mappings = buildTokenMappings(values, tokens);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].mapping.kind).toBe("new");
    // Must be the text token, never the spacing one — that was the bug.
    expect(mappings[0].mapping.nearest).toBe("--text-sm");
    expect(mappings[0].mapping.proposedName).toBe("--zt-text-heading");
  });

  it("collapses the same prop+value on two paths into one entry", () => {
    const values = {
      "form/card[0]": { gap: "12px" },
      "form/card[1]": { gap: "12px" },
    };
    expect(buildTokenMappings(values, tokens)).toHaveLength(1);
  });

  it("ignores a prop outside TOKEN_PROPS", () => {
    const values = { form: { display: "flex" } };
    expect(buildTokenMappings(values, tokens)).toEqual([]);
  });

  it("sorts entries by prop then value for a stable table", () => {
    const values = {
      form: { gap: "12px", color: "rgb(11, 14, 19)" },
      "form/card[0]": { color: "rgb(1, 2, 3)" },
    };
    const mappings = buildTokenMappings(values, tokens);
    expect(mappings.map((m) => `${m.prop}:${m.value}`)).toEqual([
      "color:rgb(1, 2, 3)",
      "color:rgb(11, 14, 19)",
      "gap:12px",
    ]);
  });
});

describe("flattenValues", () => {
  // The bridge between the one skeleton walk and Task 12b's two consumers,
  // which both want a flat `path → props` map. The paths it produces must be
  // the skeleton's own — the same ones skeleton.md and values.md report — so
  // `--zt-text-heading` is named after the node a reader can actually find.
  const node = (over = {}) => ({ role: "group", values: {}, children: [], ...over });

  it("keys every node by its skeleton path, root first", () => {
    const skeleton = node({
      role: "card",
      values: { gap: "24px" },
      children: [
        node({
          role: "form",
          values: { gap: "12px" },
          children: [node({ role: "input", values: { color: "red" } })],
        }),
      ],
    });
    expect(flattenValues(skeleton)).toEqual({
      card: { gap: "24px" },
      "card/form[0]": { gap: "12px" },
      "card/form[0]/input[0]": { color: "red" },
    });
  });

  it("indexes siblings sharing a role so they never collapse onto one key", () => {
    const skeleton = node({
      role: "form",
      children: [
        node({ role: "row", values: { gap: "1px" } }),
        node({ role: "row", values: { gap: "2px" } }),
      ],
    });
    expect(flattenValues(skeleton)).toEqual({
      form: {},
      "form/row[0]": { gap: "1px" },
      "form/row[1]": { gap: "2px" },
    });
  });

  it("feeds buildTokenMappings a leaf role it can name a token after", () => {
    const skeleton = node({
      role: "form",
      children: [node({ role: "heading", values: { fontSize: "22px" } })],
    });
    const mappings = buildTokenMappings(flattenValues(skeleton), parseThemeTokens("@theme {}"));
    expect(mappings).toHaveLength(1);
    expect(mappings[0].mapping.proposedName).toBe("--zt-text-heading");
  });
});

describe("collectFontStacks", () => {
  it("splits a single stack into its distinct families", () => {
    const values = { form: { fontFamily: '"Geist", "Helvetica Neue", sans-serif' } };
    expect(collectFontStacks(values)).toEqual(['"Geist"', '"Helvetica Neue"', "sans-serif"]);
  });

  it("dedupes families shared across two nodes' stacks", () => {
    const values = {
      form: { fontFamily: "Geist, sans-serif" },
      "form/action[0]": { fontFamily: "Geist, sans-serif" },
    };
    expect(collectFontStacks(values)).toEqual(["Geist", "sans-serif"]);
  });

  it("skips a node with no fontFamily rather than throwing", () => {
    const values = { form: {}, "form/action[0]": { fontFamily: "Geist" } };
    expect(collectFontStacks(values)).toEqual(["Geist"]);
  });
});

describe("checkFontPreflight", () => {
  // The exact (designValues, appValues) → preflight-result step runCompare
  // calls after the skeleton gate passes. Extracted and tested directly so a
  // regression that passes raw values (or a raw font-family string) instead
  // of the arrays `collectFontStacks` produces fails a test, not just a
  // reviewer's reading.
  it("collects and dedupes each side's font stacks across multiple nodes before comparing", () => {
    const design = {
      form: { fontFamily: "Geist, sans-serif" },
      "form/action[0]": { fontFamily: "Geist, sans-serif" },
    };
    const app = { form: { fontFamily: "Geist, sans-serif" } };
    expect(checkFontPreflight(design, app)).toEqual({
      ok: true,
      message: "font stack shodný: Geist, sans-serif",
    });
  });

  it("fails and names both stacks when the app's fonts differ from the design's", () => {
    const design = { form: { fontFamily: "Geist, sans-serif" } };
    const app = { form: { fontFamily: "Inter, sans-serif" } };
    const result = checkFontPreflight(design, app);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Geist");
    expect(result.message).toContain("Inter");
  });
});

describe("historyFromRaw", () => {
  it("starts an empty history when there is nothing to parse", () => {
    expect(historyFromRaw(undefined)).toEqual([]);
    expect(historyFromRaw(null)).toEqual([]);
  });

  it("starts an empty history rather than failing on unreadable content", () => {
    expect(historyFromRaw("{not json")).toEqual([]);
    expect(historyFromRaw(JSON.stringify({ not: "an array" }))).toEqual([]);
  });

  it("parses a previously persisted array of rounds", () => {
    const rounds = [{ percent: 3, skeletonPass: true, reason: "x" }];
    expect(historyFromRaw(JSON.stringify(rounds))).toEqual(rounds);
  });
});

describe("stripImages", () => {
  it("removes appImage and maskImage but keeps the rest", () => {
    const round = {
      percent: 1.2,
      skeletonPass: true,
      reason: "ok",
      appImage: Buffer.from("app"),
      maskImage: Buffer.from("mask"),
    };
    const stripped = stripImages(round);
    expect(stripped).toEqual({ percent: 1.2, skeletonPass: true, reason: "ok" });
    // toEqual treats a key set to `undefined` as absent, so it would pass an
    // implementation that sets `appImage: undefined` instead of actually
    // removing the key. Assert the keys are genuinely gone.
    expect(stripped).not.toHaveProperty("appImage");
    expect(stripped).not.toHaveProperty("maskImage");
  });

  it("is a no-op when there are no image buffers", () => {
    const round = { percent: null, skeletonPass: false, reason: "skeleton gate neprošel" };
    expect(stripImages(round)).toEqual(round);
  });
});

describe("combineVerdict", () => {
  it("carries status through on a done round, ignoring decideNext's stop", () => {
    const roundVerdict = { status: "done", reason: "diff 0.3 %" };
    const next = { stop: true, reason: "irrelevant once done" };
    expect(combineVerdict(roundVerdict, next)).toEqual({
      status: "done",
      stop: false,
      reason: "diff 0.3 %",
    });
  });

  it("carries decideNext's stop and reason through on a non-done round", () => {
    const roundVerdict = { status: "continue", reason: "diff 3 % nad prahem" };
    const next = { stop: true, reason: "strop 5 kol vyčerpán" };
    expect(combineVerdict(roundVerdict, next)).toEqual({
      status: "continue",
      stop: true,
      reason: "strop 5 kol vyčerpán",
    });
  });

  it("keeps a parked round's own reason and forces stop, ignoring decideNext entirely", () => {
    // decideNext reasons about the history of percentages; it has no way to
    // know the fonts differ, so a round that already carries its own reason
    // must not have it discarded in favour of decideNext's (e.g. "pokračuje",
    // which would be actively misleading here — nothing about a font
    // mismatch is fixed by another round).
    const roundVerdict = { status: "parked", reason: "font stack se liší — design: [Geist]" };
    const next = { stop: false, reason: "pokračuje" };
    expect(combineVerdict(roundVerdict, next)).toEqual({
      status: "parked",
      stop: true,
      reason: "font stack se liší — design: [Geist]",
    });
  });
});

describe("selectExitCode", () => {
  it("is 0 when done", () => {
    expect(selectExitCode({ status: "done", stop: false, reason: "x" })).toBe(0);
  });

  it("is 1 when continuing (another round expected)", () => {
    expect(selectExitCode({ status: "continue", stop: false, reason: "x" })).toBe(1);
  });

  it("is 2 when parked (stopped without a done verdict)", () => {
    expect(selectExitCode({ status: "continue", stop: true, reason: "x" })).toBe(2);
  });

  it("is 3 on error, regardless of stop — never collapses into 1 (continue)", () => {
    expect(selectExitCode({ status: "error", stop: false })).toBe(3);
    expect(selectExitCode({ status: "error", stop: true })).toBe(3);
  });
});

describe("describeOutcome", () => {
  it("pairs each status with the same exit code selectExitCode returns, plus a console label", () => {
    expect(describeOutcome({ status: "done", stop: false })).toEqual({
      code: 0,
      label: "HOTOVO",
    });
    expect(describeOutcome({ status: "continue", stop: false })).toEqual({
      code: 1,
      label: "POKRAČUJ",
    });
    expect(describeOutcome({ status: "continue", stop: true })).toEqual({
      code: 2,
      label: "PARK",
    });
    expect(describeOutcome({ status: "error" })).toEqual({ code: 3, label: "CHYBA" });
  });
});

describe("isDeliberateError", () => {
  it("recognizes our own design-match: prefixed errors", () => {
    expect(isDeliberateError(new Error("design-match: compare vyžaduje --slug <slug>"))).toBe(true);
  });

  it("treats anything else as an unexpected crash needing its stack", () => {
    expect(isDeliberateError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isDeliberateError("not even an Error instance")).toBe(false);
  });
});

describe("buildCompareOutcome", () => {
  const skeletonPass = { pass: true, findings: [] };
  const skeletonFail = {
    pass: false,
    findings: [{ path: "form", kind: "layout-mode", message: "grid vs flex-column" }],
  };

  it("a skeleton-gated result forwards values as null (never []) so values.md can tell 'not compared' from 'no deltas', and carries no image buffers", () => {
    // Defect 1 (task 14b): `?? []` used to launder a never-run comparison into
    // the same empty array a genuine all-match result produces — renderValues
    // could not tell them apart. null must survive all the way to the payload.
    const result = { skeleton: skeletonFail, values: null, pixels: null };
    const { payload, roundRecord } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
    });

    expect(payload.values).toBeNull();
    const currentRound = payload.rounds.at(-1);
    expect(currentRound).not.toHaveProperty("appImage");
    expect(currentRound).not.toHaveProperty("maskImage");
    expect(roundRecord).not.toHaveProperty("appImage");
    expect(roundRecord).not.toHaveProperty("maskImage");
  });

  it("forwards strictWrappers so values.md can name what the run did not measure", () => {
    // renderValues needs to know whether wrapper collapsing was in effect —
    // a collapsed wrapper is unmeasured area, and the artifact has to say so.
    const base = {
      result: { skeleton: skeletonFail, values: null, pixels: null },
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
    };
    expect(buildCompareOutcome({ ...base, strictWrappers: true }).payload.strictWrappers).toBe(
      true,
    );
    expect(buildCompareOutcome({ ...base, strictWrappers: false }).payload.strictWrappers).toBe(
      false,
    );
    // Absent means the default — collapsing on, so the note gets shown.
    expect(buildCompareOutcome(base).payload.strictWrappers).toBe(false);
  });

  it("an ungated result carries the real values array and both image buffers on the current round only", () => {
    const appImage = Buffer.from("app");
    const maskImage = Buffer.from("mask");
    const values = [{ path: "form", prop: "gap", expected: "16px", actual: "12px", message: "x" }];
    const result = {
      skeleton: skeletonPass,
      values,
      pixels: { percent: 0.3, largestRegion: { w: 2, h: 2 }, diffBuffer: maskImage },
      appImage,
    };
    const { payload, roundRecord, fullHistory } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
    });

    expect(payload.values).toBe(values);
    const currentRound = payload.rounds.at(-1);
    expect(currentRound.appImage).toBe(appImage);
    expect(currentRound.maskImage).toBe(maskImage);
    // The persisted/replayed shape never carries the buffers.
    expect(roundRecord).not.toHaveProperty("appImage");
    expect(roundRecord).not.toHaveProperty("maskImage");
    expect(fullHistory.at(-1)).toBe(roundRecord);
  });

  it("replays prior history untouched and appends only the current round", () => {
    const priorRound = { percent: 8, skeletonPass: true, reason: "diff 8 %" };
    const result = { skeleton: skeletonFail, values: null, pixels: null };
    const { payload, fullHistory } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [priorRound],
    });

    expect(payload.rounds[0]).toBe(priorRound);
    expect(fullHistory[0]).toBe(priorRound);
    expect(fullHistory).toHaveLength(2);
  });

  it("carries the spec's tokenMappings through, defaulting to [] when absent (a pre-task-12b spec.json)", () => {
    const result = { skeleton: skeletonFail, values: null, pixels: null };
    const withMappings = buildCompareOutcome({
      result,
      spec: { selector: "#x", tokenMappings: [{ value: "12px", prop: "gap" }] },
      slug: "epic-card",
      masks: [],
      history: [],
    });
    expect(withMappings.payload.tokenMappings).toEqual([{ value: "12px", prop: "gap" }]);

    const withoutMappings = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
    });
    expect(withoutMappings.payload.tokenMappings).toEqual([]);
  });

  it("a passing font preflight leaves the round as a normal done verdict — percent, images and exit code all present", () => {
    const appImage = Buffer.from("app");
    const maskImage = Buffer.from("mask");
    const result = {
      skeleton: skeletonPass,
      values: [],
      pixels: { percent: 0.3, largestRegion: { w: 2, h: 2 }, diffBuffer: maskImage },
      appImage,
    };
    const { payload, verdict } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
      fontPreflight: { ok: true, message: "font stack shodný: Geist" },
    });

    const currentRound = payload.rounds.at(-1);
    expect(currentRound.percent).toBe(0.3);
    expect(currentRound.skeletonPass).toBe(true);
    expect(currentRound.appImage).toBe(appImage);
    expect(currentRound.maskImage).toBe(maskImage);
    expect(verdict.status).toBe("done");
    expect(selectExitCode(verdict)).toBe(0);
  });

  it("a failing font preflight parks the run — no pixels, the font message as the round's and the verdict's reason, exit code 2", () => {
    const appImage = Buffer.from("app");
    const maskImage = Buffer.from("mask");
    const result = {
      skeleton: skeletonPass,
      values: [],
      pixels: { percent: 12, largestRegion: { w: 40, h: 40 }, diffBuffer: maskImage },
      appImage,
    };
    const message =
      "font stack se liší — design: [Geist], implementace: [Inter]. Sjednoť je dřív, než se začne porovnávat.";
    const { payload, roundRecord, verdict } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
      fontPreflight: { ok: false, message },
    });

    const currentRound = payload.rounds.at(-1);
    expect(currentRound.percent).toBeNull();
    expect(currentRound.reason).toBe(message);
    expect(currentRound.skeletonPass).toBe(true);
    expect(currentRound).not.toHaveProperty("appImage");
    expect(currentRound).not.toHaveProperty("maskImage");
    expect(roundRecord).not.toHaveProperty("appImage");
    // A font mismatch tells the Task-14 driver to stop and hand this to the
    // operator — not "continue" (nothing about it is fixed by another round,
    // since percent stays null forever) and not silently "done".
    expect(verdict.status).toBe("parked");
    expect(verdict.reason).toBe(message);
    expect(selectExitCode(verdict)).toBe(2);
  });
});

describe("loadHistory", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-cli-history-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("starts empty when rounds.json does not exist yet", async () => {
    expect(await loadHistory(dir, false)).toEqual([]);
  });

  it("reads back a previously persisted history", async () => {
    const rounds = [{ percent: 4, skeletonPass: true, reason: "x" }];
    await fs.writeFile(path.join(dir, "rounds.json"), JSON.stringify(rounds), "utf8");
    expect(await loadHistory(dir, false)).toEqual(rounds);
  });

  it("--reset discards a previously persisted history without even reading it", async () => {
    const rounds = [{ percent: 4, skeletonPass: true, reason: "x" }];
    await fs.writeFile(path.join(dir, "rounds.json"), JSON.stringify(rounds), "utf8");
    expect(await loadHistory(dir, true)).toEqual([]);
  });
});

describe("readSpec", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-cli-spec-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads and parses a previously written spec.json", async () => {
    const spec = { selector: "#x", skeleton: {}, tokenMappings: [], version: DESIGN_MATCH_VERSION };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    expect(await readSpec(dir, "some-slug")).toEqual(spec);
  });

  it("throws a clear message naming measure when spec.json is missing (not a raw ENOENT)", async () => {
    await expect(readSpec(dir, "missing-slug")).rejects.toThrow(/measure/);
    await expect(readSpec(dir, "missing-slug")).rejects.toThrow(/missing-slug/);
  });

  it("throws a clear message naming measure when spec.json predates the current DESIGN_MATCH_VERSION", async () => {
    // A spec.json written by an older design-match — matchRole didn't exist yet — must not
    // be silently compared as if it had it: that produces a confident, wrong structural
    // finding ("role kořene: undefined vs node") instead of an honest "re-run measure".
    const spec = { selector: "#x", skeleton: {}, tokenMappings: [], version: "0.0.1" };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    await expect(readSpec(dir, "stale-slug")).rejects.toThrow(/measure/);
    await expect(readSpec(dir, "stale-slug")).rejects.toThrow("stale-slug");
  });

  it("throws the same way when spec.json has no version field at all (pre-versioning format)", async () => {
    const spec = { selector: "#x", skeleton: {}, tokenMappings: [] };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    await expect(readSpec(dir, "no-version-slug")).rejects.toThrow(/measure/);
  });

  // Fix round 2, N3: `assertSpecMeasured` was only ever tested in isolation, so
  // deleting the call from readSpec left the whole suite green — and this is the
  // seam that matters, because the blank specs already on disk are well-formed
  // current-version documents that only readSpec stands between and `compare`.
  it("refuses a blank spec.json on read, not only through the predicate in isolation", async () => {
    const spec = {
      selector: "#root",
      skeleton: { tag: "div", role: "group", children: [] },
      tokenMappings: [],
      version: DESIGN_MATCH_VERSION,
    };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    await expect(readSpec(dir, "blank-slug")).rejects.toThrow(/^design-match:.*prázdný region/);
    await expect(readSpec(dir, "blank-slug")).rejects.toThrow("blank-slug");
  });

  // Fix round 1, M2 (the cheap half): round-trips a real spec.json carrying
  // strictWrappers through the actual disk read, not just the pure predicate
  // in isolation — covers the "readSpec's output is what checkStrictWrappersMatch
  // actually receives" seam. The write half (does runMeasure actually stamp the
  // field) stays uncovered; narrowing that seam needs runMeasure's stamping
  // pulled into a pure function, which is out of scope for this fix round.
  it("round-trips a spec measured with --strict-wrappers through readSpec into checkStrictWrappersMatch", async () => {
    const spec = {
      selector: "#x",
      skeleton: {},
      tokenMappings: [],
      version: DESIGN_MATCH_VERSION,
      strictWrappers: true,
    };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    const read = await readSpec(dir, "strict-slug");
    expect(() => checkStrictWrappersMatch(read, true)).not.toThrow();
    expect(() => checkStrictWrappersMatch(read, false)).toThrow(/--strict-wrappers/);
  });
});

describe("checkStrictWrappersMatch", () => {
  // Defect 2 (task 14b): measure and compare each normalise a tree with their
  // own --strict-wrappers flag. If they disagree, one tree is collapsed and
  // the other isn't, and the skeleton gate reports findings that are pure
  // artifacts of the mismatch — not of the implementation. Same precedent as
  // readSpec's version check just above: refuse outright rather than cope.

  it("does not throw when compare's flag matches what measure stamped into spec.json", () => {
    expect(() => checkStrictWrappersMatch({ strictWrappers: true }, true)).not.toThrow();
    expect(() => checkStrictWrappersMatch({ strictWrappers: false }, false)).not.toThrow();
  });

  it("throws naming --strict-wrappers when compare requests it but measure did not", () => {
    expect(() => checkStrictWrappersMatch({ strictWrappers: false }, true)).toThrow(
      /--strict-wrappers/,
    );
  });

  it("throws the same way in the other direction (measure had it, compare does not)", () => {
    expect(() => checkStrictWrappersMatch({ strictWrappers: true }, false)).toThrow(
      /--strict-wrappers/,
    );
  });

  it("throws a design-match:-prefixed, deliberate error (not a raw crash)", () => {
    expect(() => checkStrictWrappersMatch({ strictWrappers: true }, false)).toThrow(
      /^design-match:/,
    );
  });
});

/**
 * D2 part 2 (task 15): seven of the eleven real mockups rendered nothing and
 * `measure` wrote a confident one-node spec at exit 0. Serving over http fixes
 * the causes we know about; this refuses to write a spec for the ones we don't.
 */
describe("assertRegionRendered", () => {
  const raw = (over = {}) => ({ tag: "div", text: "", children: [], ...over });

  it("refuses an empty container — no children, no text, nothing that is content in itself", () => {
    expect(() => assertRegionRendered(raw(), "#root")).toThrow(/^design-match:/);
  });

  it("routes through the clean one-line operator path rather than dumping a stack", () => {
    try {
      assertRegionRendered(raw(), "#root");
      expect.unreachable("assertRegionRendered must throw for an empty container");
    } catch (error) {
      expect(isDeliberateError(error)).toBe(true);
    }
  });

  it("names the selector and the three likely causes", () => {
    expect(() => assertRegionRendered(raw(), "#root")).toThrow(/#root/);
    expect(() => assertRegionRendered(raw(), "#root")).toThrow(/nevykreslila|skripty|prázdn/i);
  });

  // Superseded by M3 (fix round 1): having children is no longer enough on its
  // own — the children have to carry something. See the subtree suite below.
  it("accepts a region whose child carries content", () => {
    expect(() =>
      assertRegionRendered(raw({ children: [raw({ tag: "span", text: "ahoj" })] }), "#root"),
    ).not.toThrow();
  });

  it("accepts a childless region that carries its own text", () => {
    expect(() =>
      assertRegionRendered(raw({ tag: "button", text: "Uložit" }), "button.primary"),
    ).not.toThrow();
  });

  // The case to think hardest about: task 15's `--region 2` on ZIBBY Orb.html
  // legitimately measured the three.js `<canvas>` — one node, no children, no
  // text, filling the whole viewport. A threshold that refused this would
  // reject a measurement that was actually correct.
  it("accepts a childless, textless element that is itself content", () => {
    for (const tag of ["canvas", "img", "svg", "video", "iframe", "input"]) {
      expect(() => assertRegionRendered(raw({ tag }), tag)).not.toThrow();
    }
  });
});

/**
 * Fix round 1, M3: the guard used to inspect only the measured node, so a page
 * that rendered a single empty wrapper satisfied it and wrote a two-node spec
 * describing two nested nothings.
 */
describe("assertRegionRendered, over the whole subtree", () => {
  const raw = (over = {}) => ({ tag: "div", text: "", children: [], ...over });

  it("refuses a root whose only child is itself an empty container", () => {
    expect(() => assertRegionRendered(raw({ children: [raw()] }), "#root")).toThrow(
      /^design-match:/,
    );
  });

  it("refuses a chain of empty wrappers however deep", () => {
    const chain = raw({ children: [raw({ children: [raw({ children: [raw()] })] })] });
    expect(() => assertRegionRendered(chain, "#root")).toThrow(/^design-match:/);
  });

  it("accepts a tree whose only content sits two levels down", () => {
    const tree = raw({ children: [raw({ children: [raw({ tag: "span", text: "ahoj" })] })] });
    expect(() => assertRegionRendered(tree, "#root")).not.toThrow();
  });

  it("accepts a tree whose only content is a self-content element deep inside", () => {
    const tree = raw({ children: [raw({ children: [raw({ tag: "canvas" })] })] });
    expect(() => assertRegionRendered(tree, "#root")).not.toThrow();
  });

  // Found the expensive way, by re-running the corpus: ZIBBY Roadmap.html's
  // #root is seven levels of nested layout divs whose first text sits at DOM
  // depth 13, below extractRaw's cap of 6. A depth-blind subtree rule refused
  // it — a false refusal on the mockup SKILL.md uses as its worked example.
  it("accepts a subtree the extraction depth cap cut off, because unknown is not empty", () => {
    const cut = raw({ children: [raw({ children: [raw({ truncated: true })] })] });
    expect(() => assertRegionRendered(cut, "#root")).not.toThrow();
  });

  it("still refuses when the same shape was fully explored", () => {
    const explored = raw({ children: [raw({ children: [raw({ truncated: false })] })] });
    expect(() => assertRegionRendered(explored, "#root")).toThrow(/^design-match:/);
  });
});

/**
 * Fix round 1, I1: three blank one-node `#root` specs written before the guard
 * existed are still well-formed 1.3.0 documents, so the version stamp cannot
 * see them and `compare` runs against a description of nothing — a confident
 * SKELETON MISMATCH that is an artifact of the tool, not the implementation.
 */
describe("assertSpecMeasured", () => {
  const node = (over = {}) => ({ role: "group", tag: "div", children: [], ...over });

  it("refuses the blank one-node #root spec the silent failures left behind", () => {
    expect(() => assertSpecMeasured({ skeleton: node() }, "karta-epicu")).toThrow(/^design-match:/);
  });

  it("names the slug and tells the operator to re-measure", () => {
    expect(() => assertSpecMeasured({ skeleton: node() }, "karta-epicu")).toThrow("karta-epicu");
    expect(() => assertSpecMeasured({ skeleton: node() }, "karta-epicu")).toThrow(/measure/);
  });

  it("routes through the clean one-line operator path", () => {
    try {
      assertSpecMeasured({ skeleton: node() }, "karta-epicu");
      expect.unreachable("assertSpecMeasured must throw for a blank spec");
    } catch (error) {
      expect(isDeliberateError(error)).toBe(true);
    }
  });

  // The whole reason this is a content judgement and not a version bump: a bump
  // is all-or-nothing on the format and would condemn these two alongside the
  // blank ones. `leaf-loose` and `leaf-strict` on disk are exactly this shape.
  it("keeps a legitimate one-node <canvas> spec", () => {
    expect(() =>
      assertSpecMeasured({ skeleton: node({ tag: "canvas" }) }, "leaf-loose"),
    ).not.toThrow();
  });

  it("keeps a leaf that carried its own text, which normalizeSkeleton records as role=text", () => {
    expect(() => assertSpecMeasured({ skeleton: node({ role: "text" }) }, "label")).not.toThrow();
  });

  it("keeps a spec whose content sits below the root", () => {
    const skeleton = node({ children: [node({ children: [node({ role: "text" })] })] });
    expect(() => assertSpecMeasured({ skeleton }, "orb-dock")).not.toThrow();
  });

  // Root-only on purpose, and this is the residual it leaves. A stored skeleton
  // does not carry `extractRaw`'s depth-cap flag, so a childless node deeper in
  // the tree could equally be a genuine leaf or a subtree that was never looked
  // at — unknowable from the file, and unknown must not condemn. A childless
  // ROOT is decidable (the cap bites at level 6, never at level 0), and that is
  // the shape every one of the silent failures actually left behind.
  it("keeps a two-node spec it cannot positively call blank, rather than guessing", () => {
    expect(() =>
      assertSpecMeasured({ skeleton: node({ children: [node()] }) }, "wrapper"),
    ).not.toThrow();
  });
});

/**
 * Fix round 1, C1: the served root used to be the common ancestor of the mockup
 * and the cdn cache — the repository root in the normal case, and the whole home
 * directory for a mockup that arrived outside the project. The page is
 * same-origin with everything served and has unrestricted outbound network.
 */
describe("planMeasureMounts", () => {
  const cacheDir = path.join(".design-match", ".cdn-cache");

  it("serves exactly the mockup's own directory and the cdn cache, and nothing above either", () => {
    const html = path.join(process.cwd(), "design", "Z.I.B.B.Y", ".design-match-cached-x.html");
    const { mockupDir, mounts } = planMeasureMounts(html, cacheDir);

    expect(mockupDir).toBe(path.join(process.cwd(), "design", "Z.I.B.B.Y"));
    expect(Object.keys(mounts).sort()).toEqual(["/", "/__design-match-cdn"]);
    expect(mounts["/"]).toBe(mockupDir);
    expect(mounts["/__design-match-cdn"]).toBe(path.resolve(cacheDir));
    // The ancestor that used to be served is not among them.
    expect(Object.values(mounts)).not.toContain(path.resolve(process.cwd()));
  });

  it("refuses a mockup that lives outside the current working directory", () => {
    const outside = path.join(os.homedir(), "Downloads", "mockup.html");
    expect(() => planMeasureMounts(outside, cacheDir)).toThrow(/^design-match:/);
    expect(() => planMeasureMounts(outside, cacheDir)).toThrow(/mimo aktuální pracovní adresář/);
  });

  // Fix round 2, N1. The floor is only worth what the server actually mounts,
  // and the server mounts the realpath. A symlinked mockup directory is the
  // documented workaround for the rule above, so it is the likeliest way in.
  it("refuses a mockup reached through a symlink that leaves the working directory", async () => {
    const link = path.join(process.cwd(), `.design-match-plan-symlink-${process.pid}`);
    await fs.symlink(os.homedir(), link, "dir");
    try {
      expect(() => planMeasureMounts(path.join(link, "mockup.html"), cacheDir)).toThrow(
        /^design-match:/,
      );
    } finally {
      await fs.rm(link, { force: true });
    }
  });

  // Resolving the root moves it, so the html path has to move with it — left
  // alone, `staticUrl` would build its url with `path.relative` across two
  // different spellings of the same directory and emit a `../..` url.
  it("returns an html path spelled the same way as the root it checked", async () => {
    // Only observable through a symlink: without one, the resolved and
    // unresolved spellings are the same string and passing the original through
    // would look correct. Here they differ, and `staticUrl` — which builds its
    // url with `path.relative(root, file)` — would emit a `../..` url.
    const real = path.join(process.cwd(), "tools", "design-match", `.tmp-real-${process.pid}`);
    const link = path.join(process.cwd(), "tools", "design-match", `.tmp-link-${process.pid}`);
    await fs.mkdir(real, { recursive: true });
    await fs.symlink(real, link, "dir");
    try {
      const { mockupDir, htmlPath } = planMeasureMounts(path.join(link, "x.html"), cacheDir);

      expect(mockupDir).toBe(real);
      expect(htmlPath).toBe(path.join(real, "x.html"));
      expect(path.relative(mockupDir, htmlPath)).toBe("x.html");
    } finally {
      await fs.rm(link, { force: true });
      await fs.rm(real, { recursive: true, force: true });
    }
  });
});

/**
 * Fix round 1, I3: deferring the networkidle FIX was right, but this diff
 * created the failure path, and an operator-facing condition gets one clean
 * line — not a 30-second wait ending in a Playwright stack.
 */
describe("translateNavigationError", () => {
  const timeout = () =>
    Object.assign(new Error("Timeout 30000ms exceeded."), { name: "TimeoutError" });

  it("turns a navigation timeout into the clean one-line treatment", () => {
    const translated = translateNavigationError("http://127.0.0.1:1/x.html", timeout());
    expect(isDeliberateError(translated)).toBe(true);
    expect(translated.message).toContain("http://127.0.0.1:1/x.html");
    expect(translated.message).toMatch(/networkidle/);
  });

  it("names the cause an operator can act on", () => {
    expect(translateNavigationError("http://x/y", timeout()).message).toMatch(/fetch|polling/);
  });

  // A navigation that fails any other way is a real fault and keeps its stack —
  // the same split `isDeliberateError` draws everywhere else in this tool.
  it("passes any other navigation failure through untouched", () => {
    const other = new Error("net::ERR_CONNECTION_REFUSED");
    expect(translateNavigationError("http://x/y", other)).toBe(other);
  });
});
