import * as THREE from "three";
import { SIMPLEX_NOISE_GLSL } from "./glsl";
import { resolveSceneTokens } from "./tokens";
import type { OrbTarget } from "./modeVisuals";

/**
 * The orb layer of the cosmic scene: a finely-subdivided wireframe icosahedron
 * that ripples under drifting 3D simplex noise, shaded with a fresnel rim so it
 * reads as a translucent shell, wrapped in a soft additive glow halo. Built as a
 * plain `THREE.Group` the {@link SceneController} adds to its orb scene; it owns
 * its own damped state so every visual eases toward the mode target — nothing
 * snaps (the scene's north star).
 *
 * Phase 95 generalized this into a factory ({@link createOrbLayer}'s `opts`) so the
 * 8 subsystem mini-orbs can reuse the EXACT same shader — tinted to their registry
 * colour, smaller and lower-detail — rather than a second bespoke primitive. Calling
 * it with no options reproduces the central orb's phase-93 look byte-for-byte
 * (same seed colour derivation, same detail/glow), so the central orb's call site
 * is unchanged in behaviour.
 */

const RADIUS = 1;
/** Detail 4 → ~2500 tris: fine enough to ripple smoothly, cheap enough for mobile.
 * The default for the central orb; mini-orbs pass a lower `detail` (phase 95). */
const DETAIL = 4;
/** Default glow-shell scale/strength/segment-count — the central orb's phase-93
 * values, reused as the factory's defaults so its call site is unchanged. */
const GLOW_SCALE = 1.4;
const GLOW_STRENGTH = 0.6;
const GLOW_SEGMENTS = 48;
/** Spatial frequency of the noise field — how many lobes the deformation has. */
const NOISE_FREQ = 1.4;
/** Exponential-approach rate; ~95% of the way to target in 3/RATE s (~0.6s at 5). */
const DAMPING_RATE = 5;

const ORB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uNoiseAmp;
uniform float uNoiseSpeed;

varying vec3 vNormal;
varying vec3 vViewDir;

${SIMPLEX_NOISE_GLSL}

void main() {
  float n = snoise(position * ${NOISE_FREQ.toFixed(2)} + uTime * uNoiseSpeed);
  vec3 displaced = position + normal * n * uNoiseAmp;
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Fresnel edge fade: silhouette wires brightest, head-on wires present (not faded) →
// still a translucent shell, but the orb reads as there even dead-on.
const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float alpha = mix(0.6, 0.95, pow(fresnel, 1.6));
  gl_FragColor = vec4(uColor, alpha);
}
`;

// The glow shell: a back-side sphere rendered additively, bright only where it
// grazes the silhouette — a soft halo pooled around the orb, not a hard disk.
const GLOW_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 3.0);
  gl_FragColor = vec4(uColor, fresnel * uStrength);
}
`;

interface OrbUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
  uNoiseAmp: THREE.IUniform<number>;
  uNoiseSpeed: THREE.IUniform<number>;
}

interface GlowUniforms {
  [uniform: string]: THREE.IUniform;
  uColor: THREE.IUniform<THREE.Color>;
  uStrength: THREE.IUniform<number>;
}

export interface OrbLayer {
  object3d: THREE.Group;
  /** The orb's live world colour — the background glow tracks it (Tier 2). */
  currentColor: THREE.Color;
  /** @param flash Transient completion flash in [0, 1] — tints the orb toward the
   * `ok` token and boosts the glow, decaying to 0 (the `done`-turn green pulse). */
  update(dt: number, target: OrbTarget, reducedMotion: boolean, flash: number): void;
  dispose(): void;
}

/** Factory options (phase 95) — every field defaults to the central orb's phase-93
 * value, so `createOrbLayer()` with no args is unchanged behaviour. Mini-orbs pass
 * their subsystem's registry colour, a lower `detail`, and a smaller glow shell. */
export interface OrbLayerOptions {
  /** Seed/base colour. Defaults to the scene's accent token at half brightness (the
   * central orb's own seed) — mini-orbs pass their subsystem's registry hex. */
  seedColor?: THREE.ColorRepresentation;
  /** Icosahedron subdivision level. Default 4 (~2500 tris); mini-orbs use 2 (~320 tris). */
  detail?: number;
  /** Glow shell radius as a multiple of {@link RADIUS}. Default 1.25. */
  glowScale?: number;
  /** Glow shell base additive strength. Default 0.35. */
  glowStrength?: number;
  /** Glow shell sphere resolution (both axes). Default 48; mini-orbs use fewer
   * segments — the halo is a soft blur, so a lower-poly sphere is indistinguishable. */
  glowSegments?: number;
}

function damp(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * DAMPING_RATE));
}

/** Build the orb layer. Call once per scene mount; drive it with {@link OrbLayer.update}. */
export function createOrbLayer(opts: OrbLayerOptions = {}): OrbLayer {
  const group = new THREE.Group();

  const detail = opts.detail ?? DETAIL;
  const glowScale = opts.glowScale ?? GLOW_SCALE;
  const glowStrengthBase = opts.glowStrength ?? GLOW_STRENGTH;
  const glowSegments = opts.glowSegments ?? GLOW_SEGMENTS;

  const tokens = resolveSceneTokens();
  const seedColor =
    opts.seedColor !== undefined
      ? new THREE.Color(opts.seedColor)
      : new THREE.Color(tokens.accent).multiplyScalar(0.5);

  // Wireframe orb.
  const orbUniforms: OrbUniforms = {
    uTime: { value: 0 },
    uColor: { value: seedColor.clone() },
    uNoiseAmp: { value: 0.08 },
    uNoiseSpeed: { value: 0.18 },
  };
  const orbMaterial = new THREE.ShaderMaterial({
    uniforms: orbUniforms,
    vertexShader: ORB_VERTEX,
    fragmentShader: ORB_FRAGMENT,
    transparent: true,
    wireframe: true,
    depthWrite: false,
  });
  const orbGeometry = new THREE.IcosahedronGeometry(RADIUS, detail);
  const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
  group.add(orbMesh);

  // Glow shell (slightly larger, additive back-side halo).
  const glowUniforms: GlowUniforms = {
    uColor: { value: seedColor.clone() },
    uStrength: { value: glowStrengthBase },
  };
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowGeometry = new THREE.SphereGeometry(RADIUS * glowScale, glowSegments, glowSegments);
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  group.add(glowMesh);

  // Damped state chased toward the mode target every frame.
  const currentColor = new THREE.Color().copy(seedColor);
  const targetColor = new THREE.Color();
  const okColor = new THREE.Color(tokens.ok);
  let amp = 0.08;
  let speed = 0.18;
  let rotation = 0.05;
  let pulseAmp = 0;
  let pulseSpeed = 0;
  let pulsePhase = 0;
  let glow = glowStrengthBase;
  // A slow secondary tumble axis so the orb never looks like it spins on one axis.
  let tiltPhase = 0;

  return {
    object3d: group,
    currentColor,
    update(dt, target, reducedMotion, flash) {
      const tokens2 = resolveSceneTokens();
      const targetAmp = reducedMotion ? 0.01 : target.noiseAmp;
      const targetRotation = reducedMotion ? target.rotationSpeed * 0.05 : target.rotationSpeed;
      const targetPulseAmp = reducedMotion ? 0 : target.pulseAmp;

      amp = damp(amp, targetAmp, dt);
      speed = damp(speed, target.noiseSpeed, dt);
      rotation = damp(rotation, targetRotation, dt);
      pulseAmp = damp(pulseAmp, targetPulseAmp, dt);
      pulseSpeed = damp(pulseSpeed, target.pulseSpeed, dt);
      glow = damp(glow, target.glow, dt);

      pulsePhase += dt * pulseSpeed;
      const pulse = pulseAmp * (0.5 + 0.5 * Math.sin(pulsePhase));

      // Colour resolves from a design token (the central orb, driven by SceneMode) or
      // a direct hex override (mini-orbs, tinted to their fixed subsystem colour —
      // never one of the shared state tokens, see `tokens.ts` doc comment).
      if (target.colorToken) {
        targetColor.set(tokens2[target.colorToken]).multiplyScalar(target.intensity);
      } else if (target.color !== undefined) {
        targetColor.set(target.color).multiplyScalar(target.intensity);
      } else {
        targetColor.copy(seedColor);
      }
      currentColor.lerp(targetColor, 1 - Math.exp(-dt * DAMPING_RATE));
      // Completion flash: blend toward the `ok` token for the brief pulse. Applied
      // after the mode ease so it overrides colour without disturbing the target.
      if (flash > 0.001) currentColor.lerp(okColor, flash * 0.85);

      orbMesh.rotation.y += dt * rotation;
      tiltPhase += dt * rotation * 0.4;
      orbMesh.rotation.x = Math.sin(tiltPhase) * 0.25;

      const scale = 1 + pulse;
      orbMesh.scale.setScalar(scale);

      orbUniforms.uTime.value += dt;
      orbUniforms.uNoiseAmp.value = amp + pulse * 0.6;
      orbUniforms.uNoiseSpeed.value = speed;
      orbUniforms.uColor.value.copy(currentColor);

      glowUniforms.uColor.value.copy(currentColor);
      glowUniforms.uStrength.value = glow * (1 + pulse) + flash * 0.5;
      glowMesh.scale.setScalar(1 + pulse * 0.5);
    },
    dispose() {
      orbGeometry.dispose();
      orbMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
    },
  };
}
