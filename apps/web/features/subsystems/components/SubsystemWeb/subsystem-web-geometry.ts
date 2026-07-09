/**
 * Pure geometry for the subsystem web. Phase 83 laid down 8 FIXED slots, one per
 * subsystem in registry order, plus the path helpers the SVG component draws its
 * static spokes/rim from. Phase 94 ("the octagon, not the ellipse") reshapes the
 * ring into a REGULAR OCTAGON — equal radius on both axes, `forge` anchored at the
 * BOTTOM (6 o'clock, `+90°`) — and replaces "every spoke converges on the centre"
 * with an INNER HUB OCTAGON: 8 hub vertices on a small ring that clears the central
 * orb with margin. A node's spoke now stops at ITS hub vertex (radial, never
 * reaching the centre); the 8 hub vertices join edge-to-edge into the inner
 * octagon, so nothing in the net ever overlaps the orb it rings.
 *
 * Nothing here touches React or the DOM — same spirit as `pipeline-graph.ts` — so
 * slot math and path strings are unit-tested independent of rendering.
 *
 * Positions are keyed by {@link SubsystemId}, not array index: a slot is looked up by
 * the subsystem's place in the canonical `SUBSYSTEMS` registry, so a node's position
 * never depends on the order (or completeness) of the `SubsystemWithStatus[]` the API
 * returns — the web strip must NOT reflow if the feed is severity-sorted or a status
 * is momentarily missing. Phase 89's particle layer reuses {@link pathFor} to animate
 * along the same fixed edges by id, without needing to know pixel geometry itself —
 * a dispatch/report particle now rides the spoke between a node and ITS hub vertex,
 * never through the centre.
 */
import { SUBSYSTEMS, type SubsystemId, type SubsystemWithStatus } from "@zibby/contracts";

export interface WebPoint {
  x: number;
  y: number;
}

export interface WebSlot extends WebPoint {
  /** Position in the fixed ring, 0-based — also the registry rank. */
  index: number;
  /** Degrees, 0 = due right, 90 = bottom, clockwise — the angle the slot sits at. */
  angle: number;
}

/** A subsystem's live status plus its fixed slot geometry, ready to render. */
export interface PositionedSubsystem extends SubsystemWithStatus, WebSlot {}

// ---- viewBox --------------------------------------------------------------
/** The SVG's local coordinate space — the component scales this to fill its box.
 * Squarer than Phase 83's 640×220 ellipse box so `preserveAspectRatio xMidYMid
 * meet` doesn't distort the now-regular octagon. */
export const WEB_VIEWBOX_WIDTH = 500;
export const WEB_VIEWBOX_HEIGHT = 500;
export const WEB_CENTER: WebPoint = { x: WEB_VIEWBOX_WIDTH / 2, y: WEB_VIEWBOX_HEIGHT / 2 };

// ---- octagon shape ----------------------------------------------------------
/** The node ring's radius — EQUAL on both axes (a circle), so 8 points spaced 45°
 * apart form a REGULAR octagon, not Phase 83's flattened ellipse. */
export const WEB_RADIUS = 195;

// ---- node / orb sizing ------------------------------------------------------
export const NODE_RADIUS = 22;
/** The ZIBBY orb sits at the octagon's center, its diameter ≈ 2× a node's — i.e. its
 * radius is 2× a node's radius. */
export const ORB_RADIUS = NODE_RADIUS * 2;

// ---- inner hub octagon --------------------------------------------------------
/** The inner hub ring's radius — where every spoke stops (never the centre) and
 * where the 8 hub vertices join into the inner octagon. {@link ORB_RADIUS} is only
 * this module's own documentation of the orb/node size ratio — the WebGL orb
 * itself (half-scale `core` group, `orbLayer.ts`'s glow shell) renders noticeably
 * larger on screen than that ratio implies once projected through the scene
 * camera. This is tuned directly against the ChatScreen overlay's actual on-screen
 * scale (Phase 94) so the hub ring clears the REAL rendered orb (glow included)
 * with a comfortable margin, while staying well inside the node ring
 * ({@link WEB_RADIUS}) — see the ChatScreen overlay's `max-w` for the other half
 * of this calibration. */
export const HUB_RADIUS = 170;

/** The registry's canonical order — the one and only source of slot assignment. */
export const REGISTRY_ORDER: readonly SubsystemId[] = SUBSYSTEMS.map((s) => s.id);
export const SLOT_COUNT = REGISTRY_ORDER.length;

/**
 * The `count` fixed slots evenly spaced (45°) around the regular octagon, starting
 * at the BOTTOM (`+90°` — index 0, `forge`, sits at 6 o'clock) and proceeding
 * CLOCKWISE. Pure function of `count` alone — same input, same output, every time
 * (no randomness, no dependency on live data).
 */
export function computeSlots(count: number = SLOT_COUNT): WebSlot[] {
  return ringPoints(count, WEB_RADIUS);
}

/** The fixed slots, computed once (module-level — geometry never changes at runtime). */
const SLOTS = computeSlots();

/**
 * The inner hub octagon's vertices — same angles as {@link computeSlots}, a
 * smaller radius ({@link HUB_RADIUS}). Each node's spoke stops at the hub vertex
 * sharing its angle, so the spoke is always radial (node, hub vertex, and the
 * centre are colinear).
 */
export function computeHubVertices(count: number = SLOT_COUNT): WebSlot[] {
  return ringPoints(count, HUB_RADIUS);
}

/** The fixed hub vertices, computed once (module-level, same posture as {@link SLOTS}). */
const HUB_VERTICES = computeHubVertices();

function ringPoints(count: number, radius: number): WebSlot[] {
  const points: WebSlot[] = [];
  for (let index = 0; index < count; index++) {
    const angle = 90 + (360 / count) * index;
    const rad = (angle * Math.PI) / 180;
    points.push({
      index,
      angle,
      x: round(WEB_CENTER.x + radius * Math.cos(rad)),
      y: round(WEB_CENTER.y + radius * Math.sin(rad)),
    });
  }
  return points;
}

/** A subsystem id's fixed slot, or `undefined` for an id outside the registry. */
export function slotForId(id: SubsystemId): WebSlot | undefined {
  const index = REGISTRY_ORDER.indexOf(id);
  return index === -1 ? undefined : SLOTS[index];
}

/** The hub vertex at a given ring position (0-based, same rank as {@link slotForId}). */
export function hubVertexForIndex(index: number): WebSlot | undefined {
  return HUB_VERTICES[index];
}

/** A subsystem id's hub vertex — the point its spoke stops at, just outside the
 * orb — or `undefined` for an id outside the registry. */
export function hubVertexForId(id: SubsystemId): WebSlot | undefined {
  const index = REGISTRY_ORDER.indexOf(id);
  return index === -1 ? undefined : hubVertexForIndex(index);
}

/**
 * Attach fixed slot geometry to each subsystem, keyed by registry rank (not array
 * position) and returned in registry order — so the octagon reads the same
 * left-to-right, top-to-bottom regardless of what order the API served them in (the
 * feed is severity-sorted; this never is). An id outside the registry is dropped
 * defensively; a registry id missing from `subsystems` simply has no node drawn at
 * its slot — the slot itself (drawn from {@link computeSlots} directly) is
 * unaffected either way.
 */
export function layoutSubsystems(
  subsystems: readonly SubsystemWithStatus[],
): PositionedSubsystem[] {
  const byId = new Map(subsystems.map((s) => [s.id, s]));
  const positioned: PositionedSubsystem[] = [];
  for (const slot of SLOTS) {
    const subsystem = byId.get(REGISTRY_ORDER[slot.index]!);
    if (subsystem) positioned.push({ ...subsystem, ...slot });
  }
  return positioned;
}

/** The inner octagon's edges — hub-vertex neighbour to hub-vertex neighbour, in
 * fixed registry order (0-1, 1-2, …, last-0) — independent of live data, same as
 * the spokes. This is the ring the SubsystemWeb draws as its "Rim": it never
 * touches the orb — only the short node→hub spokes come that close, and this ring
 * joins their hub-side tips into a closed loop around it. */
export function hubEdges(): Array<[SubsystemId, SubsystemId]> {
  return REGISTRY_ORDER.map(
    (id, i) => [id, REGISTRY_ORDER[(i + 1) % REGISTRY_ORDER.length]!] as [SubsystemId, SubsystemId],
  );
}

// ---- path helpers -----------------------------------------------------------
/** A straight-line SVG path `d` string between two points, coordinates rounded for
 * stable snapshots/tests. */
export function pathBetween(a: WebPoint, b: WebPoint): string {
  return `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)}`;
}

/** A spoke: a node's fixed slot → ITS hub vertex — radial, and stopping well short
 * of the centre (never reaching it), so the net always rings the orb instead of
 * converging on it. */
export function spokePath(node: WebPoint, hub: WebPoint): string {
  return pathBetween(node, hub);
}

/**
 * Resolve one endpoint of a {@link pathFor} ride. `"orb"` no longer resolves to a
 * single fixed centre point — instead it resolves to the COUNTERPART node's hub
 * vertex, i.e. the point just outside the orb closest to that node, so a
 * dispatch/report particle rides the spoke from just outside the orb to the node
 * (or back), never through the centre. `"orb"` paired with `"orb"` has no
 * counterpart to resolve against, so it fails soft (`undefined`) — there is no
 * longer a meaningful single "orb" point.
 */
function resolveEndpoint(id: SubsystemId | "orb", counterpart: SubsystemId | "orb"): WebPoint | undefined {
  if (id === "orb") {
    return counterpart === "orb" ? undefined : hubVertexForId(counterpart);
  }
  return slotForId(id);
}

/**
 * The generic "path from A to B" phase 89's particle layer animates along — either
 * endpoint is `"orb"` or a {@link SubsystemId}. Returns `undefined` if either
 * endpoint isn't resolvable, so a bad id (or the now-meaningless `"orb"`↔`"orb"`)
 * fails soft instead of drawing a garbage path.
 */
export function pathFor(from: SubsystemId | "orb", to: SubsystemId | "orb"): string | undefined {
  const a = resolveEndpoint(from, to);
  const b = resolveEndpoint(to, from);
  if (!a || !b) return undefined;
  return pathBetween(a, b);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
