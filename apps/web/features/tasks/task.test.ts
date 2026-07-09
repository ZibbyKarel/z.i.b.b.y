import type { TaskRouting as ApiTaskRouting } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  confidenceBand,
  extractPathRanges,
  extractPaths,
  isLowConfidence,
  toClientRouting,
} from "./task";

describe("extractPaths", () => {
  it("detects ~, ./ and absolute paths and de-duplicates", () => {
    const text = "ulož do ~/zibby/memory/x.md a načti ~/zibby/memory/x.md plus /var/log/app";
    expect(extractPaths(text)).toEqual(["~/zibby/memory/x.md", "/var/log/app"]);
  });

  it("ignores prose without paths", () => {
    expect(extractPaths("zkontroluj zálohy")).toEqual([]);
  });
});

describe("extractPathRanges", () => {
  it("returns each occurrence with its character span", () => {
    const text = "ulož do ~/zibby/x.md";
    expect(extractPathRanges(text)).toEqual([{ path: "~/zibby/x.md", start: 8, end: 20 }]);
    // The span slices back to the path verbatim.
    const [r] = extractPathRanges(text);
    expect(text.slice(r?.start, r?.end)).toBe("~/zibby/x.md");
  });

  it("marks repeated paths once per occurrence (positional, not deduped)", () => {
    const text = "~/a/b a ~/a/b";
    const ranges = extractPathRanges(text);
    expect(ranges).toHaveLength(2);
    expect(ranges.map((r) => r.start)).toEqual([0, 8]);
  });

  it("returns nothing for prose without paths", () => {
    expect(extractPathRanges("zkontroluj zálohy")).toEqual([]);
  });
});

describe("confidenceBand", () => {
  it("buckets confidence into high / medium / low", () => {
    expect(confidenceBand(0.9)).toBe("high");
    expect(confidenceBand(0.5)).toBe("medium");
    expect(confidenceBand(0.2)).toBe("low");
  });

  it("flags only the low band as low-confidence", () => {
    expect(isLowConfidence(0.2)).toBe(true);
    expect(isLowConfidence(0.5)).toBe(false);
  });
});

describe("toClientRouting (Phase 11 fields)", () => {
  const base: ApiTaskRouting = {
    target: { kind: "agent", id: "koder", name: "Kodér" },
    confidence: 0.8,
    reason: "r",
    matchedTerms: [],
    candidates: [{ kind: "agent", id: "koder", name: "Kodér" }],
    mode: "single",
    proposedGoal: null,
    paths: [],
    toolGrants: [],
  };

  it("carries mode / proposedGoal / paths through to the client shape", () => {
    const loop: ApiTaskRouting = {
      ...base,
      target: { kind: "pipeline", id: "delivery", name: "Delivery" },
      mode: "loop",
      proposedGoal: {
        objective: "go until green",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 6,
        instructions: "go until green",
      },
      paths: [{ path: "~/p/alpha", project: { id: "alpha", name: "Alpha" } }],
    };
    const r = toClientRouting(loop);
    expect(r.mode).toBe("loop");
    expect(r.proposedGoal?.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(r.paths[0]?.project?.name).toBe("Alpha");
  });

  it("falls back to the kind glyph when the API target carries none", () => {
    // No `glyph` on the wire → the client coerces the kind's default icon.
    const r = toClientRouting(base);
    expect(r.target.glyph).toBe("bot");
  });
});
