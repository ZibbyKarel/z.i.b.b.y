import * as THREE from "three";
import { SIMPLEX_NOISE_GLSL } from "./glsl";
import { CATEGORY_COLORS, resolveSceneTokens } from "./tokens";

/**
 * The background layer of the cosmic scene, rendered by its own renderer (furthest
 * back, droppable to half framerate on weak devices without the orb losing
 * smoothness). Two passes:
 *
 *  1. A full-screen procedural sky — drifting nebula clouds, two independently
 *     twinkling star layers, a soft glow pooled behind the orb (Phase 94: centred on
 *     wherever the controller says the orb actually projects to, not always screen
 *     centre — see `uGlowCenter`) that tracks the orb's live colour, and corner
 *     darkening — all in one fragment shader.
 *  2. The faint distant node-web: ~100 nodes in 7 clusters coloured by the real
 *     agent categories (so it reads as the same taxonomy as the constellation),
 *     joined by proximity lines, plus drifting dust. Rendered with the shared
 *     perspective camera so it parallaxes under the scene's camera drift.
 *
 * Nothing here reacts to conversation state except the orb-glow colour — the
 * background is the stable, ever-drifting world the orb lives in.
 */

const NODE_COUNT = 100;
const CLUSTER_COUNT = 7;
const DUST_COUNT = 220;
/** Fade the whole layer in over this many seconds on first load. */
export const REVEAL_SECONDS = 1.5;

const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Nebula + stars + orb-glow + vignette. Kept deliberately restrained — a deep,
// slow sky, not a blown-out screensaver.
const SKY_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAspect;
uniform float uReveal;
uniform vec3 uOrbColor;
uniform vec3 uNebulaA;
uniform vec3 uNebulaB;
uniform vec2 uGlowCenter;

varying vec2 vUv;

${SIMPLEX_NOISE_GLSL}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// Cheap hash for the star fields.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// A twinkling star layer at a given density; each cell has at most one star.
float stars(vec2 uv, float density, float twinkleSpeed, float seed) {
  vec2 g = uv * density;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float h = hash(cell + seed);
  if (h < 0.86) return 0.0; // sparse
  vec2 starPos = vec2(hash(cell + seed + 1.0), hash(cell + seed + 2.0));
  float d = length(f - starPos);
  float core = smoothstep(0.12, 0.0, d);
  float tw = 0.5 + 0.5 * sin(uTime * twinkleSpeed + h * 40.0);
  return core * mix(0.3, 1.0, tw);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  // Deep base.
  vec3 col = vec3(0.020, 0.031, 0.055);

  // Two drifting nebula cloud layers.
  float n1 = fbm(vec3(p * 1.6 + vec2(uTime * 0.012, 0.0), uTime * 0.02));
  float n2 = fbm(vec3(p * 2.7 - vec2(0.0, uTime * 0.009), 5.0 + uTime * 0.015));
  float cloudA = smoothstep(0.0, 0.72, n1);
  float cloudB = smoothstep(0.05, 0.82, n2 * 0.5 + 0.5);
  col += uNebulaA * cloudA * 0.22;
  col += uNebulaB * cloudB * 0.15;

  // Two independent star layers.
  float s1 = stars(uv, 90.0, 2.3, 0.0);
  float s2 = stars(uv, 160.0, 3.7, 11.0);
  col += vec3(0.75, 0.82, 1.0) * s1 * 0.9;
  col += vec3(0.85, 0.9, 1.0) * s2 * 0.6;

  // Soft glow pooled behind the orb — Phase 94: centred on uGlowCenter (defaults
  // to screen centre, vec2(0), until the controller feeds the raised orb's actual
  // projected position), tracking its live colour.
  float glow = smoothstep(0.55, 0.0, length(p - uGlowCenter));
  col += uOrbColor * glow * glow * 0.28;

  // Corner darkening.
  float vig = smoothstep(1.15, 0.35, length(p));
  col *= mix(0.55, 1.0, vig);

  gl_FragColor = vec4(col * uReveal, 1.0);
}
`;

interface SkyUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uAspect: THREE.IUniform<number>;
  uReveal: THREE.IUniform<number>;
  uOrbColor: THREE.IUniform<THREE.Color>;
  uNebulaA: THREE.IUniform<THREE.Color>;
  uNebulaB: THREE.IUniform<THREE.Color>;
  uGlowCenter: THREE.IUniform<THREE.Vector2>;
}

export interface BackgroundContext {
  /** The orb's live colour — the behind-orb glow tracks it. */
  orbColor: THREE.Color;
  reducedMotion: boolean;
}

export interface BackgroundLayer {
  /** Advance time / reveal and sync uniforms. `dt` is the real frame delta even
   * when rendering is skipped a frame (so drift stays wall-clock steady). */
  update(dt: number, ctx: BackgroundContext): void;
  /** Draw both passes into `renderer`, using `camera` for the parallaxing web. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void;
  /** Set the drawing-buffer aspect so the sky shader stays undistorted. */
  setAspect(aspect: number): void;
  /** Phase 94: recentre the behind-orb glow at `(x, y)` in the sky shader's
   * centred, aspect-corrected `p` space (screen centre is `(0, 0)`; `+y` is up) —
   * the controller feeds the raised orb's own projected position so the glow keeps
   * pooling behind it instead of at screen centre. */
  setGlowCenter(x: number, y: number): void;
  dispose(): void;
}

/** Build the background layer. `mobile` halves the node-web and dust counts. */
export function createBackgroundLayer(mobile: boolean): BackgroundLayer {
  const tokens = resolveSceneTokens();

  // --- Pass 1: full-screen sky quad ---
  const skyUniforms: SkyUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uReveal: { value: 0 },
    uOrbColor: { value: new THREE.Color(tokens.accent) },
    uNebulaA: { value: new THREE.Color(tokens.accent) },
    uNebulaB: { value: new THREE.Color(tokens.run) },
    uGlowCenter: { value: new THREE.Vector2(0, 0) },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMaterial);
  skyMesh.frustumCulled = false;
  const skyScene = new THREE.Scene();
  skyScene.add(skyMesh);
  const skyCamera = new THREE.Camera();

  // --- Pass 2: node-web + dust (perspective, shares the orb camera) ---
  const webScene = new THREE.Scene();
  const nodeCount = mobile ? NODE_COUNT / 2 : NODE_COUNT;
  const dustCount = mobile ? DUST_COUNT / 2 : DUST_COUNT;

  const clusterColors = Object.values(CATEGORY_COLORS).slice(0, CLUSTER_COUNT);
  // Cluster centres spread across a shell behind the orb (negative z = further).
  const clusterCenters: THREE.Vector3[] = [];
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const a = (i / CLUSTER_COUNT) * Math.PI * 2;
    const r = 3.4 + (i % 2) * 1.1;
    clusterCenters.push(
      new THREE.Vector3(
        Math.cos(a) * r,
        Math.sin(a) * r * 0.62,
        -3.5 - (i % 3) * 1.6,
      ),
    );
  }

  const nodePositions = new Float32Array(nodeCount * 3);
  const nodeColors = new Float32Array(nodeCount * 3);
  const nodeVecs: THREE.Vector3[] = [];
  const tmpColor = new THREE.Color();
  // Deterministic pseudo-random (no Math.random — keeps mounts reproducible and
  // avoids the scene ever looking "shuffled" between renders).
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < nodeCount; i++) {
    const c = i % CLUSTER_COUNT;
    const center = clusterCenters[c]!;
    const v = new THREE.Vector3(
      center.x + (rand() - 0.5) * 2.4,
      center.y + (rand() - 0.5) * 2.4,
      center.z + (rand() - 0.5) * 2.0,
    );
    nodeVecs.push(v);
    nodePositions[i * 3] = v.x;
    nodePositions[i * 3 + 1] = v.y;
    nodePositions[i * 3 + 2] = v.z;
    tmpColor.set(clusterColors[c] ?? "#5b8def");
    nodeColors[i * 3] = tmpColor.r;
    nodeColors[i * 3 + 1] = tmpColor.g;
    nodeColors[i * 3 + 2] = tmpColor.b;
  }

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute("color", new THREE.BufferAttribute(nodeColors, 3));
  const nodeMaterial = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
  webScene.add(nodePoints);

  // Proximity lines: connect nearby nodes (precomputed once).
  const linePositions: number[] = [];
  const lineColors: number[] = [];
  const PROX = 1.7;
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      const a = nodeVecs[i]!;
      const b = nodeVecs[j]!;
      if (a.distanceTo(b) < PROX) {
        linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const ci = (i % CLUSTER_COUNT);
        tmpColor.set(clusterColors[ci] ?? "#5b8def");
        lineColors.push(tmpColor.r, tmpColor.g, tmpColor.b, tmpColor.r, tmpColor.g, tmpColor.b);
      }
    }
  }
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  webScene.add(lines);

  // Dust: faint far-scattered motes.
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (rand() - 0.5) * 16;
    dustPositions[i * 3 + 1] = (rand() - 0.5) * 10;
    dustPositions[i * 3 + 2] = -2 - rand() * 8;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.02,
    color: new THREE.Color(0.6, 0.7, 0.95),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  webScene.add(dust);

  // The whole web group drifts very slowly for depth.
  const webGroup = new THREE.Group();
  webGroup.add(nodePoints, lines, dust);
  webScene.add(webGroup);

  let elapsed = 0;
  const glowColor = new THREE.Color(tokens.accent);

  return {
    update(dt, ctx) {
      elapsed += dt;
      const reveal = Math.min(1, elapsed / REVEAL_SECONDS);
      skyUniforms.uReveal.value = reveal;
      skyUniforms.uTime.value += ctx.reducedMotion ? dt * 0.15 : dt;
      // Ease the behind-orb glow toward the orb's live colour.
      glowColor.lerp(ctx.orbColor, 1 - Math.exp(-dt * 4));
      skyUniforms.uOrbColor.value.copy(glowColor);
      nodeMaterial.opacity = 0.5 * reveal;
      lineMaterial.opacity = 0.12 * reveal;
      dustMaterial.opacity = 0.35 * reveal;
      if (!ctx.reducedMotion) {
        webGroup.rotation.y += dt * 0.01;
        webGroup.rotation.x = Math.sin(elapsed * 0.05) * 0.04;
      }
    },
    render(renderer, camera) {
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(skyScene, skyCamera);
      renderer.render(webScene, camera);
    },
    setAspect(aspect) {
      skyUniforms.uAspect.value = aspect;
    },
    setGlowCenter(x, y) {
      skyUniforms.uGlowCenter.value.set(x, y);
    },
    dispose() {
      skyMaterial.dispose();
      skyMesh.geometry.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      dustGeometry.dispose();
      dustMaterial.dispose();
    },
  };
}
