/**
 * Pure geometry of the ORG floorplan (`design/ZibbyCorp/Floorplan Map.dc.html`):
 * rooms (departments) in three rows split by a vertical spine, desks (agents) inside.
 * No React — everything is a function of the room ids + agent counts.
 */

/** Fixed metrics, px (world units). */
export const FLOORPLAN_METRICS = {
  /** desk cell */
  CW: 72,
  CH: 76,
  /** room horizontal / bottom padding */
  PX: 12,
  /** room header height */
  HEAD: 26,
  /** spine width */
  SW: 56,
  /** corridor height */
  CORR: 44,
  /** gap between rooms in a row-side */
  GAP: 10,
  /** outer margin */
  M: 40,
  /** lobby box */
  LOBBY: 120,
  LOBBY_TOP: 50,
  SPINE_TOP: 190,
  ROWS_TOP: 210,
} as const;

const { CW, CH, PX, HEAD, SW, CORR, GAP, M, LOBBY, LOBBY_TOP, SPINE_TOP, ROWS_TOP } =
  FLOORPLAN_METRICS;

export interface FloorplanRowSpec {
  /** Which side of the room faces the corridor: `down` = bottom, `up` = top. */
  door: "up" | "down";
  left: readonly string[];
  right: readonly string[];
}

/** Default placement table; ids not in it are appended to the emptiest side. */
export const DEFAULT_FLOORPLAN_ROWS: readonly FloorplanRowSpec[] = [
  { door: "down", left: ["dev"], right: ["com", "knw", "fin"] },
  { door: "up", left: ["rnd", "qa"], right: ["dist", "pub", "des"] },
  { door: "up", left: ["sec", "rel", "per"], right: ["ops", "inc"] },
];

export interface FloorplanRoomInput {
  id: string;
  agentCount: number;
}

export interface PlacedDesk {
  /** relative to the room's padding box */
  x: number;
  y: number;
}

export interface PlacedRoom {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  door: "up" | "down";
  desks: PlacedDesk[];
}

export interface FloorplanLayout {
  rooms: PlacedRoom[];
  /** total world size */
  W: number;
  H: number;
  spineX: number;
  /** widest row-side width; sets the world width (rooms are not stretched to it) */
  side: number;
  /** y of each horizontal corridor's top edge */
  corridors: number[];
  spine: { top: number; height: number };
  lobby: { x: number; y: number; size: number };
}

interface Sizing {
  id: string;
  cols: number;
  rows: number;
  base: number;
  h: number;
  n: number;
}

function sizeRoom({ id, agentCount: n }: FloorplanRoomInput): Sizing {
  const cols = Math.max(2, Math.min(5, n));
  const rows = Math.ceil(n / cols);
  return { id, n, cols, rows, base: Math.max(150, cols * CW + 2 * PX), h: HEAD + rows * CH + PX };
}

const sumBase = (list: Sizing[]) => list.reduce((s, r) => s + r.base, 0);
const sideWidth = (list: Sizing[]) => (list.length ? sumBase(list) + GAP * (list.length - 1) : 0);

export function layoutFloorplan(
  input: readonly FloorplanRoomInput[],
  rowSpecs: readonly FloorplanRowSpec[] = DEFAULT_FLOORPLAN_ROWS,
): FloorplanLayout {
  const byId = new Map(input.map((r) => [r.id, sizeRoom(r)]));
  const placed = new Set<string>();
  const pick = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const r = byId.get(id);
      if (!r || placed.has(id)) return [];
      placed.add(id);
      return [r];
    });
  const rows = rowSpecs.map((spec) => ({
    door: spec.door,
    sides: [pick(spec.left), pick(spec.right)] as [Sizing[], Sizing[]],
  }));

  // Open set: a department the table doesn't know goes to the row-side with the
  // smallest summed base width (ties: first in table order).
  const allSides = rows.flatMap((r) => r.sides);
  const first = allSides[0];
  for (const r of byId.values()) {
    if (placed.has(r.id) || !first) continue;
    allSides.reduce((a, b) => (sumBase(b) < sumBase(a) ? b : a), first).push(r);
    placed.add(r.id);
  }

  const side = Math.max(0, ...allSides.map(sideWidth));
  const W = 2 * side + SW + 2 * M;
  const spineX = W / 2;
  const rowH = rows.map((r) => Math.max(0, ...r.sides.flat().map((s) => s.h)));
  const rowY: number[] = [ROWS_TOP];
  const corridors: number[] = [];
  rows.forEach((_, i) => {
    if (i === 0) return;
    const prevBottom = (rowY[i - 1] ?? ROWS_TOP) + (rowH[i - 1] ?? 0);
    corridors.push(prevBottom);
    rowY.push(prevBottom + CORR);
  });
  const lastRow = rows.length - 1;
  const yEnd = (rowY[lastRow] ?? ROWS_TOP) + (rowH[lastRow] ?? 0);

  const out: PlacedRoom[] = [];
  rows.forEach((row, ri) =>
    row.sides.forEach((list, si) => {
      // Rooms keep their natural width (no stretching); both sides hug the spine.
      let x = si === 0 ? spineX - SW / 2 - sideWidth(list) : spineX + SW / 2;
      for (const r of list) {
        const w = r.base;
        const y = ri === 0 ? ROWS_TOP + (rowH[0] ?? 0) - r.h : (rowY[ri] ?? ROWS_TOP);
        const gx0 = (w - r.cols * CW) / 2;
        out.push({
          id: r.id,
          x,
          y,
          w,
          h: r.h,
          cols: r.cols,
          rows: r.rows,
          door: row.door,
          desks: Array.from({ length: r.n }, (_, j) => ({
            x: gx0 + (j % r.cols) * CW,
            y: HEAD + Math.floor(j / r.cols) * CH,
          })),
        });
        x += w + GAP;
      }
    }),
  );

  return {
    rooms: out,
    W,
    H: yEnd + M,
    spineX,
    side,
    corridors,
    spine: { top: SPINE_TOP, height: yEnd - SPINE_TOP },
    lobby: { x: spineX - LOBBY / 2, y: LOBBY_TOP, size: LOBBY },
  };
}
