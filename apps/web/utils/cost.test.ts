import { describe, expect, it } from "vitest";
import { formatCostUsd } from "./cost";

describe("formatCostUsd", () => {
  it.each([
    [0, "< $0.01"],
    [0.0034, "< $0.01"],
    [0.2934669, "$0.29"],
    [12.5, "$12.50"],
  ])("formats %d as %s", (usd, expected) => {
    expect(formatCostUsd(usd)).toBe(expected);
  });
});
