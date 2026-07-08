/**
 * Pure geometry for the subsystem web (Phase 83 — "the web, not an orbit"): 8 FIXED
 * ellipse slots, one per subsystem in registry order, plus the path helpers the SVG
 * component draws its static spokes/rim from. Nothing here touches React or the DOM —
 * same spirit as `pipeline-graph.ts` — so slot math and path strings are unit-tested
 * independent of rendering.
 *
 * Positions are keyed by {@link SubsystemId}, not array index: a slot is looked up by
 * the subsystem's place in the canonical `SUBSYSTEMS` registry, so a node's position
 * never depends on the order (or completeness) of the `SubsystemWithStatus[]` the API
 * returns — the web strip must NOT reflow if the feed is severity-sorted or a status
 * is momentarily missing. Phase 89's particle layer reuses {@link pathFor} to animate
 * along the same fixed edges by id, without needing to know pixel geometry itself.
 */
import { SUBSYSTEMS, type SubsystemId, type SubsystemWithStatus } from "@zibby/contracts";

export interface WebPoint {
  x: number;
  y: number;
}

export interface WebSlot extends WebPoint {
  /** Position in the fixed ring, 0-based — also the registry rank. */
  index: number;
  /** Degrees, 0 = due right, -90 = top, clockwise — the angle the slot sits at. */
  angle: number;
}

/** A subsystem's live status plus its fixed slot geometry, ready to render. */
export interface PositionedSubsystem extends SubsystemWithStatus, WebSlot {}

// ---- viewBox --------------------------------------------------------------
/** The SVG's local coordinate space — the component scales this to fill its box. */
export const WEB_VIEWBOX_WIDTH = 640;
export const WEB_VIEWBOX_HEIGHT = 220;
export const WEB_CENTER: WebPoint = { x: WEB_VIEWBOX_WIDTH / 2, y: WEB_VIEWBOX_HEIGHT / 2 };

// ---- ellipse shape ----------------------------------------------------------
/** Horizontal radius nodes sit on. */
export const WEB_RX = 260;
/** "Flattened ellipse" — vertical radius is a fraction of the horizontal one, so the
 * strip stays short (design doc: ry ≈ 0.35 × rx). */
export const WEB_RY_RATIO = 0.35;
export const WEB_RY = WEB_RX * WEB_RY_RATIO;

// ---- node / orb sizing ------------------------------------------------------
export const NODE_RADIUS = 22;
/** The ZIBBY orb sits at the ellipse's center, its diameter ≈ 2× a node's — i.e. its
 * radius is 2× a node's radius. */
export const ORB_RADIUS = NODE_RADIUS * 2;

/** The registry's canonical order — the one and only source of slot assignment. */
export const REGISTRY_ORDER: readonly SubsystemId[] = SUBSYSTEMS.map((s) => s.id);
export const SLOT_COUNT = REGISTRY_ORDER.length;

/**
 * The `count` fixed slots evenly spaced around the flattened ellipse, starting at the
 * top (-90°) and proceeding clockwise. Pure function of `count` alone — same input,
 * same output, every time (no randomness, no dependency on live data).
 */
export function computeSlots(count: number = SLOT_COUNT): WebSlot[] {
  const slots: WebSlot[] = [];
  for (let index = 0; index < count; index++) {
    const angle = -90 + (360 / count) * index;
    const rad = (angle * Math.PI) / 180;
    slots.push({
      index,
      angle,
      x: round(WEB_CENTER.x + WEB_RX * Math.cos(rad)),
      y: round(WEB_CENTER.y + WEB_RY * Math.sin(rad)),
    });
  }
  return slots;
}

/** The fixed slots, computed once (module-level — geometry never changes at runtime). */
const SLOTS = computeSlots();

/** A subsystem id's fixed slot, or `undefined` for an id outside the registry. */
export function slotForId(id: SubsystemId): WebSlot | undefined {
  const index = REGISTRY_ORDER.indexOf(id);
  return index === -1 ? undefined : SLOTS[index];
}

/**
 * Attach fixed slot geometry to each subsystem, keyed by registry rank (not array
 * position) and returned in registry order — so the ellipse reads the same left-to-
 * right, top-to-bottom regardless of what order the API served them in (the feed is
 * severity-sorted; this never is). An id outside the registry is dropped defensively;
 * a registry id missing from `subsystems` simply has no node drawn at its slot — the
 * slot itself (drawn from {@link computeSlots} directly) is unaffected either way.
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

/** The ring edges connecting ellipse-neighbors, in fixed registry order (0-1, 1-2, …,
 * last-0) — independent of live data, same as the spokes. */
export function rimEdges(): Array<[SubsystemId, SubsystemId]> {
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

/** A spoke: center → a node's fixed slot. */
export function spokePath(slot: WebPoint): string {
  return pathBetween(WEB_CENTER, slot);
}

/** A rim segment: one node's fixed slot → its ellipse-neighbor's. */
export function rimPath(a: WebPoint, b: WebPoint): string {
  return pathBetween(a, b);
}

/**
 * The generic "path from A to B" phase 89's particle layer will animate along —
 * either endpoint is `"orb"` (the center) or a {@link SubsystemId}. Returns
 * `undefined` if either endpoint isn't a known slot, so a bad id fails soft instead
 * of drawing a garbage path.
 */
export function pathFor(from: SubsystemId | "orb", to: SubsystemId | "orb"): string | undefined {
  const a = from === "orb" ? WEB_CENTER : slotForId(from);
  const b = to === "orb" ? WEB_CENTER : slotForId(to);
  if (!a || !b) return undefined;
  return pathBetween(a, b);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
