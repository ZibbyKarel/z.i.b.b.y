import * as THREE from "three";
import { resolveSceneTokens } from "./tokens";

/**
 * The helix rings around the orb: thin glowing tori that fade in during the
 * `thinking`/`tool` states, each tilted differently and rotating at its own speed,
 * their colour drifting from `--color-accent` toward a cooler secondary hue, with a
 * bright pulse travelling around each ring. Opacity eases toward the mode target so
 * they never snap in or out.
 */

const RING_COUNT = 3;
/** Cooler secondary the rings drift toward (a cyan in ZIBBY's cosmic family). */
const SECONDARY_HEX = "#4fd1e0";
const DAMPING_RATE = 4;

const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uPulseSpeed;
varying vec2 vUv;
void main() {
  // A bright pulse travelling around the major circumference (uv.x).
  float band = abs(fract(vUv.x - uTime * uPulseSpeed) - 0.5);
  float pulse = smoothstep(0.5, 0.32, band);
  float a = uOpacity * (0.28 + 0.72 * pulse);
  gl_FragColor = vec4(uColor, a);
}
`;

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  spin: number;
  colorPhase: number;
}

export interface RingsLayer {
  object3d: THREE.Group;
  /** @param target ring opacity in [0,1] (from the mode); eased internally. */
  update(dt: number, elapsed: number, target: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createRingsLayer(): RingsLayer {
  const group = new THREE.Group();
  const tokens = resolveSceneTokens();
  const accent = new THREE.Color(tokens.accent);
  const secondary = new THREE.Color(SECONDARY_HEX);
  const rings: Ring[] = [];
  let opacity = 0;

  for (let i = 0; i < RING_COUNT; i++) {
    const radius = 1.45 + i * 0.26;
    const geometry = new THREE.TorusGeometry(radius, 0.012, 8, 160);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: accent.clone() },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uPulseSpeed: { value: 0.25 + i * 0.12 },
      },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Each ring on a distinct plane.
    mesh.rotation.x = 1.1 + i * 0.5;
    mesh.rotation.y = i * 0.7;
    group.add(mesh);
    rings.push({ mesh, material, spin: (0.15 + i * 0.08) * (i % 2 === 0 ? 1 : -1), colorPhase: i * 1.7 });
  }

  const tmp = new THREE.Color();

  return {
    object3d: group,
    update(dt, elapsed, target, reducedMotion) {
      opacity += (target - opacity) * (1 - Math.exp(-dt * DAMPING_RATE));
      const spinScale = reducedMotion ? 0 : 1;
      for (const ring of rings) {
        ring.mesh.rotation.z += dt * ring.spin * spinScale;
        const u = ring.material.uniforms;
        u.uOpacity!.value = opacity;
        u.uTime!.value += reducedMotion ? 0 : dt;
        // Drift accent -> cooler secondary, per-ring phase.
        const mix = 0.5 + 0.5 * Math.sin(elapsed * 0.4 + ring.colorPhase);
        tmp.copy(accent).lerp(secondary, mix);
        (u.uColor!.value as THREE.Color).copy(tmp);
      }
      group.visible = opacity > 0.01;
    },
    dispose() {
      for (const ring of rings) {
        ring.mesh.geometry.dispose();
        ring.material.dispose();
      }
    },
  };
}
