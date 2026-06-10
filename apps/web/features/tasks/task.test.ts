import { describe, expect, it } from "vitest";
import { confidenceBand, extractPaths, isLowConfidence } from "./task";

describe("extractPaths", () => {
  it("detects ~, ./ and absolute paths and de-duplicates", () => {
    const text = "ulož do ~/zibby/memory/x.md a načti ~/zibby/memory/x.md plus /var/log/app";
    expect(extractPaths(text)).toEqual(["~/zibby/memory/x.md", "/var/log/app"]);
  });

  it("ignores prose without paths", () => {
    expect(extractPaths("zkontroluj zálohy")).toEqual([]);
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
