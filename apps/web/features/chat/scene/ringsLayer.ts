import * as THREE from "three";
import { resolveSceneTokens } from "./tokens";

/**
 * A single soft halo around the orb — the restrained successor (Phase 55) to the old
 * triple helix of bright, additively-blended, pulse-chasing tori, which read far too
 * loud for a "tichý velín". It carries exactly the same SCENE STATE the rings did:
 * the mode target (from {@link modeVisuals}) is non-zero only while ZIBBY is genuinely
 * live — `thinking` / `tool` (full) and `streaming` (partial) — so the halo fades in
 * only then. `idle`, `listening`, `waiting-approval` and `error` all target zero, so
 * it stays fully dark: quiet by default, a faint glow only when live.
 *
 * The halo is one camera-facing torus whose tube is feathered to a haze rather than a
 * crisp line, painted in the scene's own accent token (no forked hue, no colour
 * drift). Opacity eases toward the mode target so it never snaps, and — only in
 * motion — breathes almost imperceptibly. No travelling bright pulse: this is a
 * whisper of light, not a ring of it.
 */

/** Peak alpha of the halo at full mode opacity — deliberately low, so even the
 * loudest live state (`thinking`/`tool`, target 1) reads as a faint aura rather than
 * a bright ring. */
const HALO_ALPHA = 0.32;
/** Exponential-approach rate for the opacity fade in/out (so it never snaps). */
const DAMPING_RATE = 4;
/** Depth of the live halo's breathing swell (fraction of peak) — a barely-there
 * pulse, and only when motion is allowed. */
const BREATHE_DEPTH = 0.18;
/** Angular speed of that breath (rad/s). */
const BREATHE_SPEED = 1.1;
/** Near-still self-rotation (rad/s) so a live halo isn't frozen; motion only. */
const SPIN_SPEED = 0.06;

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  // Feather across the tube (vUv.y): brightest on the centreline, fading to nothing
  // at both rims — a soft band of haze instead of a hard-edged ring.
  float edge = abs(vUv.y - 0.5) * 2.0;
  float halo = smoothstep(1.0, 0.0, edge);
  gl_FragColor = vec4(uColor, uOpacity * halo);
}
`;

export interface RingsLayer {
  object3d: THREE.Group;
  /** @param target halo opacity in [0,1] (from the mode); eased internally. */
  update(dt: number, elapsed: number, target: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createRingsLayer(): RingsLayer {
  const group = new THREE.Group();
  const accent = new THREE.Color(resolveSceneTokens().accent);
  // A fat, low-segment tube: the width is what the fragment feathers into a haze;
  // it sits just outside the unit-radius orb.
  const geometry = new THREE.TorusGeometry(1.45, 0.13, 16, 220);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: accent },
      uOpacity: { value: 0 },
    },
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // A slight tilt lends the flat halo a hint of depth without reading as a 3D ring.
  mesh.rotation.x = 0.32;
  group.add(mesh);

  let opacity = 0;

  return {
    object3d: group,
    update(dt, elapsed, target, reducedMotion) {
      opacity += (target - opacity) * (1 - Math.exp(-dt * DAMPING_RATE));
      if (!reducedMotion) {
        mesh.rotation.z += dt * SPIN_SPEED;
      }
      // Breathe only in motion; otherwise hold at peak. Range [1 - depth, 1].
      const breathe = reducedMotion
        ? 1
        : 1 - BREATHE_DEPTH + BREATHE_DEPTH * (0.5 + 0.5 * Math.sin(elapsed * BREATHE_SPEED));
      material.uniforms.uOpacity!.value = opacity * HALO_ALPHA * breathe;
      group.visible = opacity > 0.01;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
