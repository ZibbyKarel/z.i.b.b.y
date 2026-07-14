import { describe, expect, it } from "vitest";
import { ellipseLayout } from "./ellipseLayout";

const insets = { left: 0, right: 0, bottom: 0 };

describe("ellipseLayout", () => {
  it("returns one position per node, first at 12 o'clock", () => {
    const l = ellipseLayout(1200, 720, 8, insets);
    expect(l.positions).toHaveLength(8);
    // node 0 is at angle -PI/2 → directly above center (x≈cx, y = cy - radiusY)
    expect(l.positions[0]!.x).toBeCloseTo(l.cx, 5);
    expect(l.positions[0]!.y).toBeCloseTo(l.cy - l.radiusY, 5);
  });

  it("places nodes clockwise (node 2 of 8 is at 3 o'clock, right of center)", () => {
    const l = ellipseLayout(1200, 720, 8, insets);
    expect(l.positions[2]!.x).toBeCloseTo(l.cx + l.radiusX, 5);
    expect(l.positions[2]!.y).toBeCloseTo(l.cy, 5);
  });

  it("clamps node diameter into 48..76 and core into 96..264", () => {
    const small = ellipseLayout(400, 300, 8, insets);
    expect(small.nodeD).toBeGreaterThanOrEqual(48);
    expect(small.nodeD).toBeLessThanOrEqual(76);
    expect(small.coreSize).toBeGreaterThanOrEqual(96);
    expect(small.coreSize).toBeLessThanOrEqual(264);
  });

  it("offsets cx right when the left inset (tasks panel) is larger than the right", () => {
    const l = ellipseLayout(1200, 720, 8, { left: 300, right: 0, bottom: 0 });
    expect(l.cx).toBeGreaterThan(1200 / 2);
  });

  it("shrinks the usable height by the bottom reserve (chat dock)", () => {
    const tall = ellipseLayout(1200, 720, 8, { left: 0, right: 0, bottom: 0 });
    const docked = ellipseLayout(1200, 720, 8, { left: 0, right: 0, bottom: 260 });
    expect(docked.radiusY).toBeLessThan(tall.radiusY);
  });

  it("never returns a radiusY below the 84 floor", () => {
    const l = ellipseLayout(1200, 260, 8, { left: 0, right: 0, bottom: 240 });
    expect(l.radiusY).toBeGreaterThanOrEqual(84);
  });
});
