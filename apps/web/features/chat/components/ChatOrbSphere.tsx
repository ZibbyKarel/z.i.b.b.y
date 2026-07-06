/**
 * The 3D wireframe sphere rendered inside {@link ChatOrb} — a react-three-fiber
 * `<Canvas>` scene. This file (and everything it imports: `three` +
 * `@react-three/fiber`) is loaded exclusively through `next/dynamic({ ssr: false })`
 * from `ChatOrb.tsx`, so it must never be statically imported from anywhere else —
 * doing so would pull three.js into the eagerly-loaded HUD bundle and would also
 * try to mount a WebGL canvas during SSR/jsdom. See Rozhodnutí 2/3 in
 * `docs/plans/phase-15-chat-orb-3d-wireframe-sphere.md`.
 */
"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * The design tokens the sphere can be colored from (Rozhodnutí 6, Fáze 15.3) —
 * `ChatOrb.tsx`'s `MODE_VISUALS` picks one per mode; this module resolves it to a
 * hex string a `THREE.Color` can parse (see {@link resolveOrbColorTokens}).
 */
export type OrbColorToken = "accent" | "run" | "bad";

export interface ChatOrbSphereProps {
  /** Design token driving the wireframe color — resolved to a hex value from the
   * CSS custom property once per client (see {@link resolveOrbColorTokens}), then
   * smoothly `Color.lerp`-ed toward on every mode change (never a hard cut). */
  colorToken?: OrbColorToken;
  /** Brightness multiplier applied to the resolved token color (0–1). Modes that
   * read as "muted"/"low intensity" (idle, waiting-approval) darken the token
   * rather than picking a different color — same hue, dimmer. */
  intensity?: number;
  /** Vertex-noise displacement amplitude — the sphere's "breathing" turbulence,
   * in units of the sphere radius (1). Clamped to ~0 under reduced motion. */
  noiseAmp?: number;
  /** Noise time-evolution speed — how fast the turbulence churns. */
  noiseSpeed?: number;
  /** Continuous self-rotation speed, radians/second around the Y axis. Reduced
   * to near-zero under reduced motion. */
  rotationSpeed?: number;
  /** Extra periodic swell added on top of `noiseAmp` (0 = no pulse) — the "tool"
   * and "waiting-approval" modes' pulse (replaces the old ripple rings). Dropped
   * under reduced motion, same as the base amplitude. */
  pulseAmp?: number;
  /** Pulse angular speed, radians/second — how fast the swell cycles. */
  pulseSpeed?: number;
}

const RADIUS = 1;
const DETAIL = 3;
/** Spatial frequency of the noise field — how many "lobes" the deformation has. */
const NOISE_FREQ = 1.4;

/** CSS custom property backing each color token. */
const CSS_VAR_BY_TOKEN: Record<OrbColorToken, string> = {
  accent: "--color-accent",
  run: "--color-run",
  bad: "--color-bad",
};

/** Hex fallbacks (mirroring `libs/design-system/src/theme/globals.css`) used when
 * `getComputedStyle` can't resolve the custom property (or runs too early). */
const FALLBACK_HEX_BY_TOKEN: Record<OrbColorToken, string> = {
  accent: "#5b8def",
  run: "#7aa5f8",
  bad: "#ff6b6b",
};

let resolvedTokenCache: Record<OrbColorToken, string> | null = null;

/**
 * Read the three color tokens' resolved hex values from the DOM once per client
 * session and cache them — a CSS custom property can't be assigned directly to a
 * WebGL uniform, and the theme is static dark (nothing to react to at runtime),
 * so one `getComputedStyle` read at first use is enough (Rozhodnutí 6). Safe to
 * call from `useFrame` every frame afterward — it's a cached object lookup.
 */
function resolveOrbColorTokens(): Record<OrbColorToken, string> {
  if (resolvedTokenCache) return resolvedTokenCache;
  const styles = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  resolvedTokenCache = {
    accent: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.accent).trim() || FALLBACK_HEX_BY_TOKEN.accent,
    run: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.run).trim() || FALLBACK_HEX_BY_TOKEN.run,
    bad: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.bad).trim() || FALLBACK_HEX_BY_TOKEN.bad,
  };
  return resolvedTokenCache;
}

// ---------------------------------------------------------------------------
// Simplex 3D Noise
// by Ian McEwan, Ashima Arts (https://github.com/ashima/webgl-noise)
// Copyright (C) 2011 Ashima Arts. MIT License.
// ---------------------------------------------------------------------------
const SIMPLEX_NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// Displace each vertex along its normal by the noise field sampled at the
// UNDEFORMED position (a coherent field, not per-frame feedback):
// pos + normal * snoise(pos * freq + time * speed) * amp.
const VERTEX_SHADER = /* glsl */ `
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

// Fresnel-style edge fade: wires facing the camera edge-on (the silhouette)
// render bright, wires facing it head-on (the center) fade — reads as a
// translucent shell instead of a flat wireframe disk.
const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float alpha = mix(0.18, 0.95, pow(fresnel, 1.6));
  gl_FragColor = vec4(uColor, alpha);
}
`;

/**
 * `true` once, read synchronously so every mount agrees — a canvas that can't
 * get a WebGL context (jsdom in component tests, or a real GPU-less
 * environment) renders nothing rather than letting three.js throw building a
 * `WebGLRenderer`. The static core disk in `ChatOrb.tsx` (rendered underneath,
 * always) already covers the visual, so returning `null` here is never a blank
 * flash — and it's what keeps `ChatScreen.test.tsx` WebGL-free even though
 * Vitest resolves the dynamic import for real (there is no SSR/client bundle
 * split inside a single test process the way there is in a browser).
 */
function canMountWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

interface WireframeSphereProps {
  colorToken: OrbColorToken;
  intensity: number;
  noiseAmp: number;
  noiseSpeed: number;
  rotationSpeed: number;
  pulseAmp: number;
  pulseSpeed: number;
}

/** The typed shape of this material's uniforms (three's own `uniforms` field is
 * an untyped string index — this narrows what `useFrame` writes each frame). */
interface OrbUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
  uNoiseAmp: THREE.IUniform<number>;
  uNoiseSpeed: THREE.IUniform<number>;
}

/** Fresh per-mount uniforms — static defaults; every dynamic value (including
 * props) is synced imperatively in `useFrame`, so prop changes never recreate
 * the uniforms object or recompile the material. */
function createOrbUniforms(): OrbUniforms {
  return {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(FALLBACK_HEX_BY_TOKEN.accent) },
    uNoiseAmp: { value: 0 },
    uNoiseSpeed: { value: 0 },
  };
}

/** How quickly the damped values (color, amplitude, speed, rotation, pulse) chase
 * their mode-driven targets — exponential decay, frame-rate independent (Rozhodnutí
 * 6). `1 - e^(-RATE·dt)` reaches ~95% of the way to the target in `3/RATE` seconds,
 * so `5` settles in ~0.6s, matching the plan's "smooth ~0.6s" color transition. */
const DAMPING_RATE = 5;

/** Exponential approach of `current` toward `target`, frame-rate independent. */
function damp(current: number, target: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-delta * DAMPING_RATE));
}

/** The deforming wireframe icosahedron — noise displacement + fresnel shader. */
function WireframeSphere({
  colorToken,
  intensity,
  noiseAmp,
  noiseSpeed,
  rotationSpeed,
  pulseAmp,
  pulseSpeed,
}: WireframeSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const reducedMotion = usePrefersReducedMotion();

  const initialUniforms = useMemo(() => createOrbUniforms(), []);

  // Damped state, chased toward the mode's target every frame in `useFrame` below
  // — never assigned directly from props, so a mode switch glides rather than
  // jumping (Rozhodnutí 6). Seeded from the first render's props.
  const currentColor = useRef(
    new THREE.Color(resolveOrbColorTokens()[colorToken]).multiplyScalar(intensity),
  );
  const targetColor = useRef(new THREE.Color());
  const currentAmp = useRef(noiseAmp);
  const currentSpeed = useRef(noiseSpeed);
  const currentRotation = useRef(rotationSpeed);
  const currentPulseAmp = useRef(pulseAmp);
  const currentPulseSpeed = useRef(pulseSpeed);
  const pulsePhase = useRef(0);

  const targetAmp = reducedMotion ? 0.005 : noiseAmp;
  const targetRotation = reducedMotion ? rotationSpeed * 0.05 : rotationSpeed;
  const targetPulseAmp = reducedMotion ? 0 : pulseAmp;

  // All per-frame writes go through the material/mesh refs (the sanctioned
  // mutable escape) rather than the memoized initial uniforms object —
  // React-managed values stay immutable after render.
  useFrame((_, delta) => {
    currentAmp.current = damp(currentAmp.current, targetAmp, delta);
    currentSpeed.current = damp(currentSpeed.current, noiseSpeed, delta);
    currentRotation.current = damp(currentRotation.current, targetRotation, delta);
    currentPulseAmp.current = damp(currentPulseAmp.current, targetPulseAmp, delta);
    currentPulseSpeed.current = damp(currentPulseSpeed.current, pulseSpeed, delta);

    pulsePhase.current += delta * currentPulseSpeed.current;
    const pulse = currentPulseAmp.current * (0.5 + 0.5 * Math.sin(pulsePhase.current));

    targetColor.current.set(resolveOrbColorTokens()[colorToken]).multiplyScalar(intensity);
    currentColor.current.lerp(targetColor.current, 1 - Math.exp(-delta * DAMPING_RATE));

    if (meshRef.current) meshRef.current.rotation.y += delta * currentRotation.current;
    const material = materialRef.current;
    if (!material) return;
    const uniforms = material.uniforms as OrbUniforms;
    uniforms.uTime.value += delta;
    uniforms.uNoiseAmp.value = currentAmp.current + pulse;
    uniforms.uNoiseSpeed.value = currentSpeed.current;
    uniforms.uColor.value.copy(currentColor.current);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[RADIUS, DETAIL]} />
      <shaderMaterial
        transparent
        wireframe
        fragmentShader={FRAGMENT_SHADER}
        ref={materialRef}
        uniforms={initialUniforms}
        vertexShader={VERTEX_SHADER}
      />
    </mesh>
  );
}

/**
 * `"use client"` r3f scene: a slowly rotating wireframe icosahedron whose
 * vertices breathe with 3D simplex noise and whose wires fade toward the
 * center (fresnel edge fade). Lazy-loaded from {@link ChatOrb} — see the
 * module doc comment for why this file must never load eagerly. The camera
 * distance/fov are tuned so the sphere (radius {@link RADIUS}, plus headroom
 * for the noise bulge) fills most of the 264px box without clipping.
 */
export function ChatOrbSphere({
  colorToken = "accent",
  intensity = 0.5,
  noiseAmp = 0.08,
  noiseSpeed = 0.18,
  rotationSpeed = 0.05,
  pulseAmp = 0,
  pulseSpeed = 0,
}: ChatOrbSphereProps) {
  const [canRender] = useState(canMountWebGL);

  if (!canRender) return null;

  return (
    <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <WireframeSphere
        colorToken={colorToken}
        intensity={intensity}
        noiseAmp={noiseAmp}
        noiseSpeed={noiseSpeed}
        pulseAmp={pulseAmp}
        pulseSpeed={pulseSpeed}
        rotationSpeed={rotationSpeed}
      />
    </Canvas>
  );
}
