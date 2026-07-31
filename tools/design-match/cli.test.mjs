import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCompareOutcome,
  combineVerdict,
  describeOutcome,
  historyFromRaw,
  isDeliberateError,
  loadHistory,
  parseArgs,
  readSpec,
  resolveRegionIndex,
  selectExitCode,
  stripImages,
} from "./cli.mjs";

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

  it("a skeleton-gated result forwards values as [] (never null) and carries no image buffers", () => {
    const result = { skeleton: skeletonFail, values: null, pixels: null };
    const { payload, roundRecord } = buildCompareOutcome({
      result,
      spec: { selector: "#x" },
      slug: "epic-card",
      masks: [],
      history: [],
    });

    expect(payload.values).toEqual([]);
    const currentRound = payload.rounds.at(-1);
    expect(currentRound).not.toHaveProperty("appImage");
    expect(currentRound).not.toHaveProperty("maskImage");
    expect(roundRecord).not.toHaveProperty("appImage");
    expect(roundRecord).not.toHaveProperty("maskImage");
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
    const spec = { selector: "#x", skeleton: {}, values: {} };
    await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec), "utf8");
    expect(await readSpec(dir, "some-slug")).toEqual(spec);
  });

  it("throws a clear message naming measure when spec.json is missing (not a raw ENOENT)", async () => {
    await expect(readSpec(dir, "missing-slug")).rejects.toThrow(/measure/);
    await expect(readSpec(dir, "missing-slug")).rejects.toThrow(/missing-slug/);
  });
});
