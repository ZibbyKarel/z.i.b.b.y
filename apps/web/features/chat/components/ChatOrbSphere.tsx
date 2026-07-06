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

export interface ChatOrbSphereProps {
  /** Wireframe color — any three.js-parseable color string. Applied through the
   * `uColor` uniform (smooth `Color.lerp` transitions come in Fáze 15.3). */
  color?: string;
  /** Vertex-noise displacement amplitude — the sphere's "breathing" turbulence,
   * in units of the sphere radius (1). Clamped to ~0 under reduced motion. */
  noiseAmp?: number;
  /** Noise time-evolution speed — how fast the turbulence churns. */
  noiseSpeed?: number;
  /** Continuous self-rotation speed, radians/second around the Y axis. Reduced
   * to near-zero under reduced motion. */
  rotationSpeed?: number;
}

const RADIUS = 1;
const DETAIL = 3;
/** Spatial frequency of the noise field — how many "lobes" the deformation has. */
const NOISE_FREQ = 1.4;
const DEFAULT_COLOR = "#5b8def";

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
  color: string;
  noiseAmp: number;
  noiseSpeed: number;
  rotationSpeed: number;
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
    uColor: { value: new THREE.Color(DEFAULT_COLOR) },
    uNoiseAmp: { value: 0 },
    uNoiseSpeed: { value: 0 },
  };
}

/** The deforming wireframe icosahedron — noise displacement + fresnel shader. */
function WireframeSphere({ color, noiseAmp, noiseSpeed, rotationSpeed }: WireframeSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const reducedMotion = usePrefersReducedMotion();

  const initialUniforms = useMemo(() => createOrbUniforms(), []);

  const effectiveAmp = reducedMotion ? 0.005 : noiseAmp;
  const effectiveRotation = reducedMotion ? rotationSpeed * 0.05 : rotationSpeed;

  // All per-frame writes go through the material ref (the sanctioned mutable
  // escape) rather than the memoized initial object — React-managed values
  // stay immutable after render.
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * effectiveRotation;
    const material = materialRef.current;
    if (!material) return;
    const uniforms = material.uniforms as OrbUniforms;
    uniforms.uTime.value += delta;
    uniforms.uNoiseAmp.value = effectiveAmp;
    uniforms.uNoiseSpeed.value = noiseSpeed;
    uniforms.uColor.value.set(color);
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
  color = DEFAULT_COLOR,
  noiseAmp = 0.16,
  noiseSpeed = 0.4,
  rotationSpeed = 0.12,
}: ChatOrbSphereProps) {
  const [canRender] = useState(canMountWebGL);

  if (!canRender) return null;

  return (
    <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <WireframeSphere
        color={color}
        noiseAmp={noiseAmp}
        noiseSpeed={noiseSpeed}
        rotationSpeed={rotationSpeed}
      />
    </Canvas>
  );
}
