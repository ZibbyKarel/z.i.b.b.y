import { describe, expect, it } from "vitest";
import {
  combineVerdict,
  historyFromRaw,
  parseArgs,
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
    expect(stripImages(round)).toEqual({ percent: 1.2, skeletonPass: true, reason: "ok" });
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
});
