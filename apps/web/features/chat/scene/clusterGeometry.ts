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
