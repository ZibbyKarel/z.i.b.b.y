import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import * as THREE from "three";
import { hashJitter } from "../../subsystems/components/SubsystemWeb/particle-mapping";
import { MAX_ORBITERS } from "../subsystemLoad";

/**
 * Task B4 (Velín-D retune) — the signature per-subsystem orbital task-particles:
 * "each light = one processing task". Velín-D's `VcOrbitField`: up to
 * {@link MAX_ORBITERS} lights per subsystem, each riding its OWN tilted 3D ring
 * around that subsystem's live mini-orb centre — `R` (radius), `inc`
 * (inclination), `rot` (ring-plane yaw), `speed`, and `phase`, all deterministic
 * per `${subsystemId}:${orbiterIndex}` seed (via `particle-mapping.ts`'s
 * `hashJitter` — never `Math.random()`, so orbits are stable across frames and
 * across reloads).
 *
 * ONE fixed-size `THREE.Points` pool, allocated ONCE at `8 * MAX_ORBITERS`
 * (one block of `MAX_ORBITERS` slots per registry subsystem, in `SUBSYSTEMS`
 * order) — the pool NEVER grows or shrinks; `setCount` only changes how many of
 * a subsystem's block are drawn (alpha 0 for the rest). `update` touches only
 * plain typed-array writes and local numbers — no `new Vector3`/array literal
 * per frame, so a busy scene with all 48 slots live costs nothing beyond the
 * fixed buffer writes.
 */

/** Every registry subsystem gets one fixed-size block of the pool — this is the
 * layer's total vertex count, never anything else. */
const POOL_SIZE = SUBSYSTEMS.length * MAX_ORBITERS;

// --- Tuned per-orbiter ranges (Velín-D `VcOrbitField` parameters) -----------
/** Ring radius, cluster-local world units — a small halo hugging the mini-orb
 * (which itself has world radius `MINI_ORB_WORLD_RADIUS = 0.16`). */
const RADIUS_MIN = 0.22;
const RADIUS_MAX = 0.34;
/** Ring inclination (radians) — how far the ring tilts out of the frontal
 * plane; 0 would be a flat, edge-on circle (a tiny slit), so this range keeps
 * every ring visibly "orbiting" rather than degenerating to a line. */
const INCLINATION_MIN = 0.35;
const INCLINATION_MAX = 1.3;
/** Orbit angular speed (rad/s) — deliberately slow: a lazy drift of light, not
 * a spin. Half the seeds run the opposite direction (see `buildParams`) so
 * neighbouring orbiters don't all sweep the same way. */
const SPEED_MIN = 0.25;
const SPEED_MAX = 0.6;

/** Base (un-depth-scaled) CSS-pixel point size for an orbiter — a small sprite,
 * deliberately much fainter/smaller than a handoff-flight mote
 * (`particleLayer.ts`'s 14px head): this is ambient load, not an event. */
const BASE_SIZE_PX = 5;
/** Peak (un-depth-scaled) alpha an orbiter reaches at its ring's nearest point. */
const BASE_ALPHA = 0.85;
/** Depth-fade/scale floor — the FARTHEST point of the ring (tilted away from
 * the camera) never fully disappears/shrinks to zero, just recedes. */
const DEPTH_FLOOR = 0.35;

/** `gl_PointSize` is in DEVICE pixels; every size this module writes is CSS
 * pixels, scaled at write-time — mirrors `particleLayer.ts`'s own DPR handling. */
const PIXEL_RATIO =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export interface OrbitFieldLayer {
  object3d: THREE.Points;
  /** How many of subsystem `id`'s (fixed) `MAX_ORBITERS`-sized block are
   * currently active (clamped to `[0, MAX_ORBITERS]`) — the rest hold alpha 0
   * until `update`'s next call. A no-op for an id outside the registry. */
  setCount(id: SubsystemId, n: number): void;
  /** Advance every active orbiter's ring position by `dt` seconds (frozen when
   * `reducedMotion`) and re-tilt it around `centers.get(subsystemId)` — the
   * controller's live mini-orb world position, reused verbatim so an orbiter
   * never lags a subsystem still mid-entry-animation or elliptical-slot easing.
   * A subsystem missing from `centers` draws none of its orbiters this frame. */
  update(dt: number, centers: Map<SubsystemId, THREE.Vector3>, reducedMotion: boolean): void;
  dispose(): void;
}

const ORBIT_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 color;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Soft round glow, same posture as particleLayer.ts's fragment shader — a small
// additive sprite rather than a flat disk.
const ORBIT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float glow = smoothstep(0.5, 0.0, dist);
  gl_FragColor = vec4(vColor, glow * vAlpha);
}
`;

/** One slot's fixed (construction-time-only) orbit parameters. */
interface SlotParams {
  radius: number;
  /** Ring inclination — precomputed cos/sin so `update` never calls
   * `Math.cos`/`Math.sin` for this fixed value every frame. */
  cosInc: number;
  sinInc: number;
  /** Ring-plane yaw (radians) — precomputed cos/sin so `update` never calls
   * `Math.cos`/`Math.sin` for this fixed value every frame. */
  cosRot: number;
  sinRot: number;
  /** Signed angular speed (rad/s) — direction baked in (see `buildParams`). */
  speed: number;
  phase: number;
}

/** Deterministic per-slot orbit parameters from `${subsystemId}:${index}` —
 * same posture as `particle-mapping.ts`'s own seeded jitter: same seed, same
 * output, always. */
function buildParams(subsystemId: SubsystemId, index: number): SlotParams {
  const seed = `${subsystemId}:${index}`;
  const radius = RADIUS_MIN + hashJitter(`${seed}:r`) * (RADIUS_MAX - RADIUS_MIN);
  const inclination =
    INCLINATION_MIN + hashJitter(`${seed}:inc`) * (INCLINATION_MAX - INCLINATION_MIN);
  const rot = hashJitter(`${seed}:rot`) * Math.PI * 2;
  const speedMag = SPEED_MIN + hashJitter(`${seed}:speed`) * (SPEED_MAX - SPEED_MIN);
  const direction = hashJitter(`${seed}:dir`) < 0.5 ? -1 : 1;
  const phase = hashJitter(`${seed}:phase`) * Math.PI * 2;
  return {
    radius,
    cosInc: Math.cos(inclination),
    sinInc: Math.sin(inclination),
    cosRot: Math.cos(rot),
    sinRot: Math.sin(rot),
    speed: speedMag * direction,
    phase,
  };
}

/** Build the orbit-field layer. Call once per scene mount; drive it with
 * {@link OrbitFieldLayer.update} every frame and {@link OrbitFieldLayer.setCount}
 * whenever `subsystemLoad.ts`'s tally changes. */
export function createOrbitFieldLayer(): OrbitFieldLayer {
  const params: SlotParams[] = [];
  /** Slot `i`'s owning subsystem id — fixed at construction (block layout never
   * changes), read every frame to look up `centers`/`activeCounts`. */
  const slotSubsystemId: SubsystemId[] = [];
  for (const subsystem of SUBSYSTEMS) {
    for (let orbiterIndex = 0; orbiterIndex < MAX_ORBITERS; orbiterIndex++) {
      params.push(buildParams(subsystem.id, orbiterIndex));
      slotSubsystemId.push(subsystem.id);
    }
  }

  /** How many of each subsystem's block are currently active — index-aligned
   * with `SUBSYSTEMS`, updated in place by `setCount` (never reallocated). */
  const activeCounts = new Uint8Array(SUBSYSTEMS.length);
  const subsystemIndex = new Map<SubsystemId, number>(SUBSYSTEMS.map((s, i) => [s.id, i]));

  const positions = new Float32Array(POOL_SIZE * 3);
  const colors = new Float32Array(POOL_SIZE * 3);
  const alphas = new Float32Array(POOL_SIZE);
  const sizes = new Float32Array(POOL_SIZE);

  // Each slot's tint is fixed to its subsystem's registry colour for the
  // layer's whole lifetime — painted once, never touched again.
  for (let slot = 0; slot < POOL_SIZE; slot++) {
    const subsystem = SUBSYSTEMS[Math.floor(slot / MAX_ORBITERS)]!;
    const color = new THREE.Color(subsystem.color);
    colors[slot * 3] = color.r;
    colors[slot * 3 + 1] = color.g;
    colors[slot * 3 + 2] = color.b;
  }

  const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setAttribute("aAlpha", alphaAttr);
  geometry.setAttribute("aSize", sizeAttr);

  const material = new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  // Same rationale as particleLayer.ts: the pool's live extent tracks 8
  // moving mini-orb centres, not a fixed bounding sphere — never cull.
  points.frustumCulled = false;

  /** The shared orbit clock — frozen (never advanced) under `reducedMotion`
   * rather than reset, so a mid-flight reduced-motion toggle just stops the
   * sweep in place instead of snapping every orbiter back to its phase-0 pose. */
  let elapsed = 0;

  return {
    object3d: points,
    setCount(id, n) {
      const idx = subsystemIndex.get(id);
      if (idx === undefined) return;
      activeCounts[idx] = Math.max(0, Math.min(n, MAX_ORBITERS));
    },
    update(dt, centers, reducedMotion) {
      if (!reducedMotion) elapsed += dt;
      for (let slot = 0; slot < POOL_SIZE; slot++) {
        // The owning subsystem's registry index is just the block number — the
        // pool is laid out as MAX_ORBITERS contiguous slots per subsystem, in
        // SUBSYSTEMS order (same integer op the construction color loop uses).
        const idx = Math.floor(slot / MAX_ORBITERS);
        const orbiterIndex = slot - idx * MAX_ORBITERS;
        const center = centers.get(slotSubsystemId[slot]!);
        if (orbiterIndex >= activeCounts[idx]! || !center) {
          alphas[slot] = 0;
          continue;
        }
        const p = params[slot]!;
        const angle = p.phase + p.speed * elapsed;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // A circle of `radius` tilted by its inclination around the local X axis
        // (precomputed cos/sin), then yawed by the slot's own fixed `rot` around
        // the local Y axis — "a tilted 3D ring" per the Velín-D reference.
        const lx = p.radius * cosA;
        const ly = p.radius * sinA * p.cosInc;
        const lz = p.radius * sinA * p.sinInc;
        const rx = lx * p.cosRot - lz * p.sinRot;
        const rz = lx * p.sinRot + lz * p.cosRot;

        const base = slot * 3;
        positions[base] = center.x + rx;
        positions[base + 1] = center.y + ly;
        positions[base + 2] = center.z + rz;

        // Depth-fade/scale by the orbiter's LOCAL z (rz): the camera looks down
        // -Z, so a positive rz is nearer the viewer than the ring's centre —
        // map [-radius, +radius] to [DEPTH_FLOOR, 1] for both alpha and size.
        const depthNorm = clamp((rz / p.radius + 1) / 2, 0, 1);
        const depthFactor = DEPTH_FLOOR + (1 - DEPTH_FLOOR) * depthNorm;
        alphas[slot] = BASE_ALPHA * depthFactor;
        sizes[slot] = BASE_SIZE_PX * PIXEL_RATIO * depthFactor;
      }
      positionAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
