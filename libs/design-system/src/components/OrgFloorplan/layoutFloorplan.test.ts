import { describe, expect, it } from "vitest";
import { FLOORPLAN_METRICS, layoutFloorplan } from "./layoutFloorplan";

const { SW, M, GAP } = FLOORPLAN_METRICS;
const rooms = (spec: Record<string, number>) =>
  Object.entries(spec).map(([id, agentCount]) => ({ id, agentCount }));
const get = (l: ReturnType<typeof layoutFloorplan>, id: string) => {
  const r = l.rooms.find((x) => x.id === id);
  if (!r) throw new Error(`no room ${id}`);
  return r;
};

describe("layoutFloorplan", () => {
  it("clamps columns to 2..5 and sizes rows", () => {
    const l = layoutFloorplan(rooms({ dev: 10, rnd: 1, qa: 3 }));
    expect([get(l, "dev").cols, get(l, "dev").rows]).toEqual([5, 2]);
    expect(get(l, "rnd").cols).toBe(2);
    expect(get(l, "qa").cols).toBe(3);
    expect(get(l, "dev").h).toBe(26 + 2 * 76 + 12);
  });

  it("keeps an empty room 2 cols wide (>=150) with no desks", () => {
    const l = layoutFloorplan(rooms({ sec: 0, rel: 0 }));
    const sec = get(l, "sec");
    expect(sec.desks).toHaveLength(0);
    expect(sec.h).toBe(26 + 12);
    expect(sec.cols).toBe(2);
  });

  it("sizes rooms by agent count only (no stretching), hugging the spine; W = 2*SIDE+SW+2*M", () => {
    const l = layoutFloorplan(rooms({ dev: 10, com: 1, knw: 1, fin: 1, rnd: 1 }));
    // widest side = com+knw+fin (3*168 + 2 gaps, 2-col floor = 524)
    expect(l.side).toBe(524);
    expect(l.W).toBe(2 * 524 + SW + 2 * M);
    expect(get(l, "rnd").w).toBe(168);
    expect(get(l, "dev").w).toBe(5 * 72 + 24);
    // left side ends at the spine
    const rnd = get(l, "rnd");
    expect(rnd.x + rnd.w).toBe(l.spineX - SW / 2);
    expect(get(l, "com").x).toBe(l.spineX + SW / 2);
    expect(get(l, "knw").x).toBe(get(l, "com").x + 168 + GAP);
  });

  it("appends unknown ids to the row-side with the smallest summed base width", () => {
    // dev alone on row1-left (150), everything else absent -> others empty (0): first empty wins
    const l = layoutFloorplan(rooms({ dev: 2, com: 2, zzz: 2 }));
    const z = get(l, "zzz");
    // smallest side is the first empty one in table order: row2-left (rnd/qa absent) -> y below corridor 1
    expect(z.door).toBe("up");
    expect(z.x).toBeLessThan(l.spineX);
    expect(z.y).toBeGreaterThan(get(l, "dev").y);
  });

  it("skips table departments missing from data and bottom-aligns row 1 to its corridor", () => {
    const l = layoutFloorplan(rooms({ dev: 10, com: 1 }));
    expect(l.rooms).toHaveLength(2);
    const [c] = l.corridors;
    expect(get(l, "dev").y + get(l, "dev").h).toBe(c);
    expect(get(l, "com").y + get(l, "com").h).toBe(c);
  });
});
