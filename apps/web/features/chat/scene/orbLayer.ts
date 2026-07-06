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
 */

const RADIUS = 1;
/** Detail 4 → ~2500 tris: fine enough to ripple smoothly, cheap enough for mobile. */
const DETAIL = 4;
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

// Fresnel edge fade: silhouette wires bright, head-on wires faint → translucent shell.
const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float alpha = mix(0.16, 0.95, pow(fresnel, 1.6));
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
  update(dt: number, target: OrbTarget, reducedMotion: boolean): void;
  dispose(): void;
}

function damp(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt * DAMPING_RATE));
}

/** Build the orb layer. Call once per scene mount; drive it with {@link OrbLayer.update}. */
export function createOrbLayer(): OrbLayer {
  const group = new THREE.Group();

  const tokens = resolveSceneTokens();
  const seedColor = new THREE.Color(tokens.accent).multiplyScalar(0.5);

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
  const orbGeometry = new THREE.IcosahedronGeometry(RADIUS, DETAIL);
  const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
  group.add(orbMesh);

  // Glow shell (slightly larger, additive back-side halo).
  const glowUniforms: GlowUniforms = {
    uColor: { value: seedColor.clone() },
    uStrength: { value: 0.35 },
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
  const glowGeometry = new THREE.SphereGeometry(RADIUS * 1.6, 48, 48);
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  group.add(glowMesh);

  // Damped state chased toward the mode target every frame.
  const currentColor = new THREE.Color().copy(seedColor);
  const targetColor = new THREE.Color();
  let amp = 0.08;
  let speed = 0.18;
  let rotation = 0.05;
  let pulseAmp = 0;
  let pulseSpeed = 0;
  let pulsePhase = 0;
  let glow = 0.35;
  // A slow secondary tumble axis so the orb never looks like it spins on one axis.
  let tiltPhase = 0;

  return {
    object3d: group,
    currentColor,
    update(dt, target, reducedMotion) {
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

      targetColor.set(tokens2[target.colorToken]).multiplyScalar(target.intensity);
      currentColor.lerp(targetColor, 1 - Math.exp(-dt * DAMPING_RATE));

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
      glowUniforms.uStrength.value = glow * (1 + pulse);
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
