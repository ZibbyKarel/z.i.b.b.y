import { describe, expect, it } from "vitest";
import { arcPath } from "./arcPath";

describe("arcPath", () => {
  it("bows a straight horizontal handoff's control point off the shared y-axis", () => {
    const d = arcPath(0, 100, 200, 100);
    const my = Number(d.split(" ")[5]);
    expect(my).not.toBe(100);
  });

  it("returns a valid `M x y Q mx my x y` path string", () => {
    const d = arcPath(0, 0, 100, 50);
    expect(d).toMatch(
      /^M -?\d+(\.\d+)? -?\d+(\.\d+)? Q -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)? -?\d+(\.\d+)?$/,
    );
  });

  it("collapses to the plain midpoint control point when bend=0", () => {
    const d = arcPath(0, 0, 100, 50, 0);
    expect(d).toBe("M 0 0 Q 50 25 100 50");
  });
});
