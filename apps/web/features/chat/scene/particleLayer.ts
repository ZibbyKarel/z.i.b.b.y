import * as THREE from "three";
import { MAX_PARTICLES } from "../../subsystems/components/SubsystemWeb/particle-mapping";

/**
 * Phase 97 — the WebGL restoration of the Phase-89 handoff particles: a fixed pool
 * of `MAX_PARTICLES` motes (a single `THREE.Points`), each riding a straight
 * `from → to` line in cluster-local space over its own duration, additive with a
 * short fading comet trail. No React, no DOM — same posture as `orbLayer.ts`/
 * `ringsLayer.ts`: the {@link SceneController} owns one instance, adds its
 * {@link ParticleLayer.object3d} to the `cluster` group (so it inherits the
 * cluster transform, same coordinate space as the mini-orb slots and the net's
 * hub vertices), calls {@link ParticleLayer.update} once per frame, and calls
 * {@link ParticleLayer.emit} whenever a real event resolves to a flight
 * (`sceneController.ts`'s `emitFlight`). `MAX_PARTICLES` is imported from
 * `particle-mapping.ts` rather than redeclared, so the pool size and the
 * event-mapping's own concurrency cap can never drift apart.
 *
 * Phase 97 LEGIBILITY PASS: the original restoration rode only the tiny hub→node
 * spoke segment and drew a single small, dim point — invisible at full-viewport
 * scale. This still isn't a laser (additive, capped alpha, a handful of pixels
 * across), but it now reads clearly as a travelling mote with a short tail: "a
 * comet, not a laser".
 */

/** Every active particle is drawn as ONE bright head point plus a few fading,
 * shrinking TRAIL points behind it along the travel direction — a single
 * `THREE.Points` still, just `POINTS_PER_PARTICLE` vertices per flight instead
 * of one, so the motion reads as a short streak rather than a single dot. */
const TRAIL_COUNT = 3;
const POINTS_PER_PARTICLE = TRAIL_COUNT + 1;

/** Fixed CSS-pixel size of a flight's HEAD point (no depth attenuation — the
 * whole octagon sits in a narrow depth band around the cluster, so attenuation
 * would be imperceptible and isn't worth the extra uniform). Raised from phase
 * 97's original 6px restoration — well past the plan's initial "~9-11px" guess
 * once visual verification showed even 11px reads as barely-there against the
 * net/starfield clutter at full-viewport scale; 14px is the size that actually
 * reads as a clear travelling mote rather than a hopeful pixel. `gl_PointSize`
 * is specified in DEVICE pixels, not CSS pixels — every size value below is
 * multiplied by {@link PIXEL_RATIO} at write-time so this stays a true ~14 CSS
 * px on a retina (devicePixelRatio 2) display instead of silently rendering at
 * half the intended size. */
const HEAD_SIZE_PX = 14;

/** Each trailing point's size, as a fraction of {@link HEAD_SIZE_PX} — shrinks
 * toward the tail so the streak tapers rather than reading as a row of equal dots. */
const TRAIL_SIZE_FACTORS: readonly number[] = [0.75, 0.5, 0.3];

/** Each trailing point's alpha, as a fraction of the HEAD's current alpha —
 * fades toward the tail (a comet, not a dotted line). Sized to match
 * {@link TRAIL_COUNT}. */
const TRAIL_ALPHA_FACTORS: readonly number[] = [0.6, 0.38, 0.2];

/** How far behind the head each trailing point sits, expressed as a fraction of
 * the flight's own `[0,1]` progress `t` (NOT a fixed world distance) — so the
 * trail is always a constant fraction of the flight's own path length,
 * regardless of that path's length or the flight's duration. Trail point `k`
 * sits at `t - (k + 1) * TRAIL_STEP_T`, clamped to 0 (never runs ahead of the
 * flight's own start). Widened from an initial 0.035 (barely distinguishable
 * from the head) so the streak reads as a short, clearly-separated tail rather
 * than a single fatter dot. */
const TRAIL_STEP_T = 0.06;

/** `gl_PointSize` is in DEVICE pixels; every size this module writes is in CSS
 * pixels and gets multiplied by this at write-time, mirroring
 * `sceneController.ts`'s own `Math.min(window.devicePixelRatio || 1, 2)` DPR
 * clamp for its renderers — otherwise a carefully-tuned ~11px mote would render
 * at half that on any retina display (`devicePixelRatio` 2). `typeof window`
 * guards the module-load-time read for non-browser test environments (falls
 * back to 1, i.e. no scaling). */
const PIXEL_RATIO =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

/** Peak alpha the HEAD reaches mid-flight — additive blending on top of this, so
 * it stays legible without outshining the net/orbs/mini-orbs. Trail points scale
 * down from this via {@link TRAIL_ALPHA_FACTORS}. */
const PEAK_ALPHA = 0.95;

/** Fraction of a flight's own [0,1] progress spent ramping in / out at each end —
 * a soft trapezoid envelope, never a hard pop into view or a hard cut at the end. */
const FADE_FRACTION = 0.18;

/** The reduced-motion "no travel" case emits a `from === to` flight (a static hold
 * at the destination) — this still runs through the exact same fade envelope, so
 * it reads as a brief pulse rather than a snap on/off. */
function fadeEnvelope(t: number): number {
  if (t < FADE_FRACTION) return t / FADE_FRACTION;
  if (t > 1 - FADE_FRACTION) return (1 - t) / FADE_FRACTION;
  return 1;
}

interface ParticleSlot {
  active: boolean;
  /** Progress through the flight, [0, 1); advances by `dt / dur` each frame. */
  t: number;
  /** Flight duration, seconds (from {@link ParticleLayer.emit}'s `durS`). */
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  /** Monotonic emission order — when the pool is full, the OLDEST (smallest) is
   * evicted, mirroring `particle-mapping.ts`'s `appendParticle` (drop oldest, never
   * a queue). */
  spawnSeq: number;
}

export interface ParticleLayer {
  object3d: THREE.Points;
  /** Claim a free slot — or, if the pool is already full, evict the OLDEST active
   * flight — and start a new one from `from` to `to` (cluster-local space),
   * tinted `color`, lasting `durS` seconds. `from === to` (same object) renders as
   * a static pulse at that point rather than travel (the reduced-motion path). */
  emit(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, durS: number): void;
  /** Advance every active flight by `dt` seconds: lerps position along
   * `from → to`, fades near both ends, deactivates once `t >= 1`. */
  update(dt: number): void;
  /** Phase 117b — whether any flight is currently in mid-travel. Feeds the
   * power-saver "is the scene at rest" check in `sceneController.ts`: a resting
   * scene must have zero active particles before the loop can park. */
  hasActive(): boolean;
  dispose(): void;
}

const PARTICLE_VERTEX = /* glsl */ `
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

// A soft round glow (radial falloff from the point's centre) with a wide, bright
// hot CORE on top — not a flat disk — additive blending pools it into a faint bloom
// while the core (now most of the point's own radius, not just its centre) keeps
// each mote perceptible as a clearly-sized dot rather than a barely-there speck.
const PARTICLE_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float glow = smoothstep(0.5, 0.0, dist);
  float core = smoothstep(0.38, 0.0, dist);
  gl_FragColor = vec4(vColor, min(glow * 0.7 + core, 1.0) * vAlpha);
}
`;

/** Build the particle layer. Call once per scene mount; drive it with
 * {@link ParticleLayer.update} every frame and {@link ParticleLayer.emit} per flight. */
export function createParticleLayer(): ParticleLayer {
  const slots: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    t: 0,
    dur: 1,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    color: new THREE.Color(),
    spawnSeq: 0,
  }));
  let nextSpawnSeq = 0;

  const vertexCount = MAX_PARTICLES * POINTS_PER_PARTICLE;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const alphas = new Float32Array(vertexCount);
  const sizes = new Float32Array(vertexCount);

  const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colorAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setAttribute("aAlpha", alphaAttr);
  geometry.setAttribute("aSize", sizeAttr);

  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  // The pool's world extent isn't a fixed sphere (motes travel across the whole
  // octagon) and the count is tiny (≤ MAX_PARTICLES) — cheaper and simpler to never
  // cull than to keep a bounding sphere in sync.
  points.frustumCulled = false;

  return {
    object3d: points,
    emit(from, to, color, durS) {
      let index = slots.findIndex((s) => !s.active);
      if (index === -1) {
        // Pool full — evict the OLDEST active flight (smallest spawnSeq), mirroring
        // particle-mapping.ts's appendParticle: a flood thins the tail, never a queue.
        index = 0;
        let oldest = slots[0]!.spawnSeq;
        for (let i = 1; i < MAX_PARTICLES; i++) {
          const seq = slots[i]!.spawnSeq;
          if (seq < oldest) {
            oldest = seq;
            index = i;
          }
        }
      }
      const slot = slots[index]!;
      slot.active = true;
      slot.t = 0;
      slot.dur = Math.max(durS, 0.001);
      slot.from.copy(from);
      slot.to.copy(to);
      slot.color.set(color);
      slot.spawnSeq = nextSpawnSeq;
      nextSpawnSeq += 1;
    },
    update(dt) {
      let touched = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const slot = slots[i]!;
        const base = i * POINTS_PER_PARTICLE;
        if (!slot.active) continue;
        touched = true;
        slot.t += dt / slot.dur;
        if (slot.t >= 1) {
          slot.active = false;
          for (let p = 0; p < POINTS_PER_PARTICLE; p++) alphas[base + p] = 0;
          continue;
        }
        const headAlpha = fadeEnvelope(slot.t) * PEAK_ALPHA;
        // The HEAD — vertex 0 of this particle's block.
        positions[base * 3] = slot.from.x + (slot.to.x - slot.from.x) * slot.t;
        positions[base * 3 + 1] = slot.from.y + (slot.to.y - slot.from.y) * slot.t;
        positions[base * 3 + 2] = slot.from.z + (slot.to.z - slot.from.z) * slot.t;
        colors[base * 3] = slot.color.r;
        colors[base * 3 + 1] = slot.color.g;
        colors[base * 3 + 2] = slot.color.b;
        alphas[base] = headAlpha;
        sizes[base] = HEAD_SIZE_PX * PIXEL_RATIO;
        // The TRAIL — vertices 1..TRAIL_COUNT, each a point further back along
        // [from, to] at an earlier `t` (clamped to 0 — never ahead of the flight's
        // own start), fading and shrinking toward the tail.
        for (let k = 0; k < TRAIL_COUNT; k++) {
          const trailT = Math.max(slot.t - (k + 1) * TRAIL_STEP_T, 0);
          const vi = base + 1 + k;
          positions[vi * 3] = slot.from.x + (slot.to.x - slot.from.x) * trailT;
          positions[vi * 3 + 1] = slot.from.y + (slot.to.y - slot.from.y) * trailT;
          positions[vi * 3 + 2] = slot.from.z + (slot.to.z - slot.from.z) * trailT;
          colors[vi * 3] = slot.color.r;
          colors[vi * 3 + 1] = slot.color.g;
          colors[vi * 3 + 2] = slot.color.b;
          alphas[vi] = headAlpha * TRAIL_ALPHA_FACTORS[k]!;
          sizes[vi] = HEAD_SIZE_PX * TRAIL_SIZE_FACTORS[k]! * PIXEL_RATIO;
        }
      }
      if (touched) {
        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
      }
    },
    hasActive() {
      return slots.some((s) => s.active);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
