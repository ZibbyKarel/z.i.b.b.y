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

/**
 * {@link octagonSlots}'s 8 vertices RE-CENTRED on an arbitrary `center` instead of
 * the cluster origin — phase 101's per-node octagon (each mini-orb gets its own
 * small ring around it, not just the shared hub/node rings above). Same angle
 * parametrization as `octagonSlots` (index 0 at the bottom, clockwise), so a node
 * octagon's vertex ordering stays comparable to the origin-centred rings. Pure
 * function of `(center, radius, count)` alone.
 */
export function octagonSlotsAround(
  center: ClusterPoint,
  radius: number,
  count: number = SLOT_COUNT,
): ClusterSlot[] {
  return octagonSlots(radius, count).map((slot) => ({
    ...slot,
    x: round(center.x + slot.x),
    y: round(center.y + slot.y),
  }));
}

/**
 * The point `distance` away from `from`, walking along the straight line toward
 * `to` — phase 101's short-link endpoint math. Shortening a hub→node spoke to a
 * link between the two octagons' facing vertices means walking IN from the
 * node's centre toward the hub by the node octagon's own radius (or,
 * symmetrically, walking OUT from the hub by the hub octagon's radius — a no-op
 * when `from` already sits exactly on that boundary, as every {@link hubSlots}
 * vertex does by construction, since the node/hub/origin triple is colinear).
 * Falls back to `from` unchanged if `from` and `to` coincide (an undefined
 * direction) rather than dividing by zero.
 */
export function pointToward(from: ClusterPoint, to: ClusterPoint, distance: number): ClusterPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: from.x, y: from.y };
  return {
    x: round(from.x + (dx / len) * distance),
    y: round(from.y + (dy / len) * distance),
  };
}

/** The inner hub ring — same angles as {@link octagonSlots}, a smaller `radius`
 * (the caller picks one that clears the central orb's rendered glow). Named
 * separately from `octagonSlots` for readability at call sites even though the
 * math is identical — a hub ring IS just a smaller-radius octagon. */
export function hubSlots(radius: number, count: number = SLOT_COUNT): ClusterSlot[] {
  return octagonSlots(radius, count);
}

/** The orb-side handoff-flight ring (phase 97 legibility pass) — same angles as
 * {@link octagonSlots}, at a `radius` just OUTSIDE the central orb's rendered
 * glow but INSIDE {@link hubSlots}'s inner octagon. A flight riding only the
 * hub→node segment (the net's own spoke) reads as a faint tick at full-viewport
 * scale because it never leaves the tiny gap between the hub ring and the node
 * ring; starting/ending it here instead means it visibly emanates from the
 * orb's surface and crosses the whole inner octagon outward (or the reverse,
 * inward, for a report) — a real flight, not a twitch. Named separately from
 * `octagonSlots`/`hubSlots` for readability even though the math is identical. */
export function orbFlightSlots(radius: number, count: number = SLOT_COUNT): ClusterSlot[] {
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

// --- Phase 97: handoff-flight endpoint resolution ---------------------------
//
// Pure geometry — no `three` import, so it's unit-testable standalone (the scene
// controller wraps the returned points in `THREE.Vector3` before handing them to
// the particle layer).

/**
 * Resolve a flight's two cluster-local endpoints. `flightForEvent`
 * (`particle-mapping.ts`) guarantees exactly one of `from`/`to` is `"orb"` — that
 * side resolves to `orbPoint` (a point on the SAME spoke as the subsystem's hub
 * vertex, but at the smaller {@link orbFlightSlots} radius, just outside the
 * central orb's rendered glow — so the mote visibly emanates from the orb's
 * surface and crosses the inner octagon outward, while still never crossing
 * through the orb's centre); the subsystem side resolves to `nodePoint` (its
 * mini-orb's LIVE position, which may still be mid-entry-animation).
 */
export function resolveFlightEndpoints(
  from: SubsystemId | "orb",
  to: SubsystemId | "orb",
  orbPoint: ClusterPoint,
  nodePoint: ClusterPoint,
): { from: ClusterPoint; to: ClusterPoint } {
  return {
    from: from === "orb" ? orbPoint : nodePoint,
    to: to === "orb" ? orbPoint : nodePoint,
  };
}

// --- Phase 96: the "mitosis" entry animation --------------------------------
//
// Pure timing/easing math for the one-shot entry fork (the 8 mini-orbs budding
// out of the central orb on mount). No `three` import — the scene controller
// drives `THREE.Vector3`/`.scale` lerps from the `[0,1]` progress this returns;
// this module only owns the WHEN, not the WebGL.

/** Default total wall-clock duration (seconds) for the whole ripple — every
 * index (including the last-starting one) reaches progress 1 by exactly this
 * many seconds, regardless of `stagger`/`count`. Mid the plan's 1.2-1.8s band. */
export const MITOSIS_TOTAL_DURATION = 1.5;

/** Default per-index stagger (seconds) — mini-orb `index` starts travelling at
 * `index * stagger`. 8 orbs × 0.09s spans a 0.63s ripple before the last orb
 * even starts, well inside {@link MITOSIS_TOTAL_DURATION}. */
export const MITOSIS_STAGGER = 0.09;

/**
 * Cubic ease-out — monotonic and stays in `[0, 1]` for `t` in `[0, 1]`. The
 * default easing for {@link mitosisProgress}: safe to drive a `scale` or
 * `position` lerp directly with no dip or overshoot.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Back ease-out — overshoots past 1 (peaking ~1.10 around `t≈0.58` for the
 * standard `c1 = 1.70158` constant used here) before settling back to exactly
 * 1 at `t = 1` — the "division wobble" / settle-with-overshoot read the phase
 * plan asks for. NOT monotonic near the tail (it rises past 1, then eases back
 * down) — only pass this to {@link mitosisProgress} for a visual flourish, not
 * anywhere a strictly monotonic `[0,1]` progress is required.
 */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export interface MitosisOptions {
  /** Total duration (seconds) for the whole staggered ripple. Default
   * {@link MITOSIS_TOTAL_DURATION}. */
  totalDuration?: number;
  /** Per-index stagger (seconds). Default {@link MITOSIS_STAGGER}. */
  stagger?: number;
  /** Easing applied to each mini-orb's own local `[0,1]` progress. Default
   * {@link easeOutCubic}. Pass {@link easeOutBack} for a touch of overshoot. */
  easing?: (t: number) => number;
}

/**
 * Mini-orb `index`'s entry progress at wall-clock `elapsed` seconds, in
 * `[0, 1]` (or briefly past it with an overshooting `easing`) — pure, no
 * WebGL, so it's unit-testable standalone. `index` starts travelling at
 * `index * stagger` and reaches its own local 1 after `totalDuration -
 * (count - 1) * stagger` seconds of travel, so EVERY index reaches exactly 1
 * by `totalDuration` regardless of `count`/`stagger` — the ripple stays one
 * bounded beat instead of a slow crawl for later indices. Before its own
 * staggered start, always exactly 0.
 */
export function mitosisProgress(
  elapsed: number,
  index: number,
  count: number,
  opts: MitosisOptions = {},
): number {
  const totalDuration = opts.totalDuration ?? MITOSIS_TOTAL_DURATION;
  const stagger = opts.stagger ?? MITOSIS_STAGGER;
  const easing = opts.easing ?? easeOutCubic;
  const start = index * stagger;
  const perOrbDuration = Math.max(totalDuration - Math.max(count - 1, 0) * stagger, 1e-6);
  const local = Math.min(Math.max((elapsed - start) / perOrbDuration, 0), 1);
  return easing(local);
}
