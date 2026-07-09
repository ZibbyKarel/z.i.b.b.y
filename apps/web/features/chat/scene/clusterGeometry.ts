/**
 * Pure cluster-local geometry math for the WebGL octagon (phase 95) — no `three`,
 * no DOM, same posture as the retired `subsystem-web-geometry.ts` it replaces.
 * Everything now lives in ONE coordinate space (the scene controller's `cluster`
 * group, in three.js WORLD units) instead of a separately-calibrated SVG viewBox,
 * so the net can hug the orb by construction instead of being tuned against a
 * projected screen offset.
 *
 * Convention: cluster-LOCAL units (before the `cluster` group's own `CLUSTER_Y`
 * translation), `+y` UP (three.js world convention, unlike the retired SVG's
 * `+y`-down viewBox). `forge` (registry index 0) sits at the BOTTOM — `-y` — and
 * the remaining 7 proceed CLOCKWISE as seen by the scene's camera (which looks
 * down `-Z` with `+Y` up — the same visual orientation a normal viewport has).
 * `angle` is kept in the retired module's own convention (90° = "bottom" before
 * the sign flip below) purely so the two geometries are easy to compare — it does
 * NOT itself flip; only the derived `y` does.
 */
import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";

export interface ClusterPoint {
  x: number;
  y: number;
}

export interface ClusterSlot extends ClusterPoint {
  /** Position in the fixed ring, 0-based — also the registry rank. */
  index: number;
  /** Degrees, in the pre-flip convention (90 = "bottom") — see the module doc. */
  angle: number;
}

/** The registry's canonical order — the one and only source of slot assignment,
 * same posture as the retired SVG geometry's `REGISTRY_ORDER`. */
export const REGISTRY_ORDER: readonly SubsystemId[] = SUBSYSTEMS.map((s) => s.id);
export const SLOT_COUNT = REGISTRY_ORDER.length;

/**
 * `count` points evenly spaced (45° for the real 8) around a regular octagon of
 * the given `radius`, index 0 at the BOTTOM, proceeding CLOCKWISE (see module
 * doc). Pure function of `(count, radius)` alone — deterministic, no live data.
 * Used for BOTH the node ring and the inner hub ring — {@link hubSlots} is a
 * semantic alias of the exact same math at a smaller radius.
 */
export function octagonSlots(radius: number, count: number = SLOT_COUNT): ClusterSlot[] {
  const points: ClusterSlot[] = [];
  for (let index = 0; index < count; index++) {
    const angle = 90 + (360 / count) * index;
    const rad = (angle * Math.PI) / 180;
    points.push({
      index,
      angle,
      x: round(radius * Math.cos(rad)),
      // Negate: the retired SVG's `+y`-down convention put "down" at +sin(rad);
      // three.js world is `+y`-up, so "down" is -sin(rad) — this is the ONLY
      // difference from the SVG geometry, and it's what keeps index 0 at the
      // bottom while preserving the same clockwise progression on screen.
      y: round(-radius * Math.sin(rad)),
    });
  }
  return points;
}

/** The inner hub ring — same angles as {@link octagonSlots}, a smaller `radius`
 * (the caller picks one that clears the central orb's rendered glow). Named
 * separately from `octagonSlots` for readability at call sites even though the
 * math is identical — a hub ring IS just a smaller-radius octagon. */
export function hubSlots(radius: number, count: number = SLOT_COUNT): ClusterSlot[] {
  return octagonSlots(radius, count);
}

/** A subsystem id's node-ring slot, or `undefined` for an id outside the registry. */
export function slotForId(
  id: SubsystemId,
  radius: number,
  count: number = SLOT_COUNT,
): ClusterSlot | undefined {
  const index = REGISTRY_ORDER.indexOf(id);
  return index === -1 ? undefined : octagonSlots(radius, count)[index];
}

/** A subsystem id's hub-ring vertex — the point its spoke stops at, just outside
 * the orb — or `undefined` for an id outside the registry. */
export function hubForId(
  id: SubsystemId,
  hubRadius: number,
  count: number = SLOT_COUNT,
): ClusterSlot | undefined {
  return slotForId(id, hubRadius, count);
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
