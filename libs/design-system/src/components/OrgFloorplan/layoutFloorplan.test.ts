import { describe, expect, it } from "vitest";
import { FLOORPLAN_METRICS, layoutFloorplan } from "./layoutFloorplan";

const { SW, M, GAP, CW, CH, PX, HEAD, CORR, ROOM_MIN } = FLOORPLAN_METRICS;
const rooms = (spec: Record<string, number>) =>
  Object.entries(spec).map(([id, agentCount]) => ({ id, agentCount }));
const get = (l: ReturnType<typeof layoutFloorplan>, id: string) => {
  const r = l.rooms.find((x) => x.id === id);
  if (!r) throw new Error(`no room ${id}`);
  return r;
};

describe("layoutFloorplan", () => {
  it("uses the goggle-era metrics", () => {
    expect([CW, CH, PX, HEAD, SW, CORR, ROOM_MIN]).toEqual([112, 104, 18, 40, 64, 56, 240]);
  });

  it("clamps columns to 2..5 and sizes rows", () => {
    const l = layoutFloorplan(rooms({ dev: 10, rnd: 1, qa: 3 }));
    expect([get(l, "dev").cols, get(l, "dev").rows]).toEqual([5, 2]);
    expect(get(l, "rnd").cols).toBe(2);
    expect(get(l, "qa").cols).toBe(3);
    expect(get(l, "dev").h).toBe(HEAD + 2 * CH + PX);
  });

  it("keeps an empty room 2 cols wide (>= ROOM_MIN) with no desks", () => {
    const l = layoutFloorplan(rooms({ sec: 0, rel: 0 }));
    const sec = get(l, "sec");
    expect(sec.desks).toHaveLength(0);
    expect(sec.h).toBe(HEAD + PX);
    expect(sec.w).toBeGreaterThanOrEqual(ROOM_MIN);
    expect(sec.cols).toBe(2);
  });

  it("sizes rooms by agent count only (no stretching), hugging the spine; W = 2*SIDE+SW+2*M", () => {
    const l = layoutFloorplan(rooms({ dev: 10, com: 1, knw: 1, fin: 1, rnd: 1 }));
    // widest side = com+knw+fin (3 * 260 + 2 gaps; a 2-col room is 2*CW + 2*PX = 260)
    const w2 = 2 * CW + 2 * PX;
    const side = 3 * w2 + 2 * GAP;
    expect(l.side).toBe(side);
    expect(l.W).toBe(2 * side + SW + 2 * M);
    expect(get(l, "rnd").w).toBe(w2);
    expect(get(l, "dev").w).toBe(5 * CW + 2 * PX);
    // left side ends at the spine
    const rnd = get(l, "rnd");
    expect(rnd.x + rnd.w).toBe(l.spineX - SW / 2);
    expect(get(l, "com").x).toBe(l.spineX + SW / 2);
    expect(get(l, "knw").x).toBe(get(l, "com").x + 2 * CW + 2 * PX + GAP);
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

  it("gives every room a door x and the corridor centre its door opens onto", () => {
    const l = layoutFloorplan(rooms({ dev: 3, rnd: 2, sec: 2 }));
    const [c1, c2] = l.corridors;
    const dev = get(l, "dev");
    expect(dev.doorX).toBe(dev.x + dev.w / 2);
    expect(dev.corrY).toBe((c1 ?? 0) + CORR / 2);
    expect(get(l, "rnd").corrY).toBe((c1 ?? 0) + CORR / 2);
    expect(get(l, "sec").corrY).toBe((c2 ?? 0) + CORR / 2);
  });

  it("keeps the 200px lobby clear of the first row of rooms", () => {
    const l = layoutFloorplan(rooms({ dev: 3 }));
    expect(l.lobby.y + l.lobby.size).toBeLessThanOrEqual(l.spine.top);
    expect(l.spine.top).toBeLessThan(get(l, "dev").y);
    expect(l.lobby.size).toBeGreaterThanOrEqual(200);
  });
});
