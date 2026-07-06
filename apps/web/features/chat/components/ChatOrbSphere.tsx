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
import { useRef, useState } from "react";
import * as THREE from "three";

export interface ChatOrbSphereProps {
  /** Wireframe color — any three.js-parseable color string. */
  color?: string;
  /**
   * Vertex-noise displacement amplitude (the sphere's "breathing" turbulence).
   * Accepted now for a stable prop surface across Fáze 15.1/15.2; the noise
   * shader that consumes it lands in Fáze 15.2 — this phase renders a static
   * (undeformed) sphere.
   */
  noiseAmp?: number;
  /** Noise time-evolution speed — how fast the turbulence churns (Fáze 15.2). */
  noiseSpeed?: number;
  /** Continuous self-rotation speed, radians/second around the Y axis. */
  rotationSpeed?: number;
}

const RADIUS = 1;
const DETAIL = 3;

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
  rotationSpeed: number;
}

/** Continuously self-rotating wireframe icosahedron — no deformation yet (Fáze 15.1). */
function WireframeSphere({ color, rotationSpeed }: WireframeSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * rotationSpeed;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[RADIUS, DETAIL]} />
      <meshBasicMaterial wireframe color={color} />
    </mesh>
  );
}

/**
 * `"use client"` r3f scene: a rotating wireframe icosahedron sphere. Lazy-loaded
 * from {@link ChatOrb} — see the module doc comment for why this file must never
 * load eagerly. The camera distance/fov are tuned so the sphere (radius {@link
 * RADIUS}, plus headroom for the Fáze 15.2 noise bulge) fills most of the 264px
 * box without clipping.
 */
export function ChatOrbSphere({
  color = "#5b8def",
  rotationSpeed = 0.12,
}: ChatOrbSphereProps) {
  const [canRender] = useState(canMountWebGL);

  if (!canRender) return null;

  return (
    <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }}>
      <WireframeSphere color={color} rotationSpeed={rotationSpeed} />
    </Canvas>
  );
}
