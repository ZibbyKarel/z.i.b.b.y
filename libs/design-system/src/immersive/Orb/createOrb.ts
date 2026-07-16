import * as THREE from "three";
import { ORB_MOTION, type OrbMotion, type OrbState } from "../orbState";
import type { OrbMotionOverrides } from "./Orb";
import { ORB_SIMPLEX } from "./orbSimplex";

export interface CreateOrbOptions {
  hex?: string;
  state?: OrbState;
  detail?: number;
  antialias?: boolean;
  motionOverrides?: OrbMotionOverrides;
}

export interface OrbController {
  setTarget(hex: string, state: OrbState, overrides?: OrbMotionOverrides): void;
  resize(): void;
  dispose(): void;
}

/**
 * A single WebGL orb: wireframe icosahedron displaced along its normals by 3D
 * simplex noise, rendered fully opaque (identity color hits the canvas 1:1),
 * wrapped in a soft additive glow shell for the fresnel falloff. One
 * instance = one canvas (own renderer/scene/camera/rAF). Color = identity;
 * motion (amplitude / noise speed / glow / breathing) = state. All parameters
 * ease exponentially toward their target (~95 % in 0.6 s).
 */
// THREE.Color's default hex/style parsing decodes sRGB into the linear working
// space (for lighting math); our raw ShaderMaterials write straight to the
// canvas with no re-encode step, so that decode alone would render every orb
// visibly darker than its design hex. NoColorSpace stores the byte ratios
// as-is so gl_FragColor reproduces the hex 1:1.
function setRawColor(color: THREE.Color, hex: string): THREE.Color {
  return color.setStyle(hex, THREE.NoColorSpace);
}

export function createOrb(container: HTMLElement, opts: CreateOrbOptions): OrbController {
  const detail = opts.detail ?? 3;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({
    antialias: Boolean(opts.antialias),
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.pointerEvents = "none";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.63); // sphere fills ~80 % of the canvas height

  const grp = new THREE.Group();
  scene.add(grp);

  const uniforms = {
    uTime: { value: Math.random() * 40 },
    uAmp: { value: ORB_MOTION.idle.amp },
    uSpeed: { value: ORB_MOTION.idle.speed },
    uColor: { value: setRawColor(new THREE.Color(), opts.hex ?? "#5b8def") },
    uGlow: { value: ORB_MOTION.idle.glow },
  };

  const wireGeometry = new THREE.IcosahedronGeometry(1, detail);
  const wireMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    wireframe: true,
    blending: THREE.NormalBlending,
    vertexShader:
      ORB_SIMPLEX +
      `
      uniform float uTime; uniform float uAmp; uniform float uSpeed;
      void main(){
        vec3 dir = normalize(position);
        float t = uTime * uSpeed;
        float n1 = snoise(dir * 1.7 + vec3(0.0,0.0,t));
        float n2 = snoise(dir * 3.4 + vec3(t*0.7,0.0,0.0));
        float disp = (n1*0.72 + n2*0.28) * uAmp;
        vec3 p = position + normal * disp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    // Fully opaque so the identity color hits the canvas 1:1 (no fresnel-alpha
    // mix darkening it against the background) — glow lives in its own additive
    // shell mesh below instead of being folded into this material's alpha.
    fragmentShader: `
      uniform vec3 uColor;
      void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
  });
  grp.add(new THREE.Mesh(wireGeometry, wireMat));

  const glowGeometry = new THREE.IcosahedronGeometry(1.12, 2);
  const glowMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying float vFres;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 N = normalize(normalMatrix * normal);
        vec3 V = normalize(-mv.xyz);
        vFres = pow(1.0 - abs(dot(N,V)), 3.2);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGlow; varying float vFres;
      void main(){ gl_FragColor = vec4(uColor, vFres * uGlow); }`,
  });
  grp.add(new THREE.Mesh(glowGeometry, glowMat));

  // Live vs target state — both mutated in place (no per-frame allocation).
  const targetColor = setRawColor(new THREE.Color(), opts.hex ?? "#5b8def");
  const initial: OrbMotion = {
    ...(ORB_MOTION[opts.state ?? "idle"] ?? ORB_MOTION.idle),
    ...opts.motionOverrides,
  };
  const tgt: OrbMotion = { ...initial };
  const cur: OrbMotion = { ...initial };

  function setTarget(hex: string, state: OrbState, overrides?: OrbMotionOverrides): void {
    setRawColor(targetColor, hex);
    const m = ORB_MOTION[state] ?? ORB_MOTION.idle;
    tgt.amp = overrides?.amp ?? m.amp;
    tgt.speed = overrides?.speed ?? m.speed;
    tgt.glow = overrides?.glow ?? m.glow;
    tgt.breath = overrides?.breath ?? m.breath;
  }

  const TAU = 0.2; // easing time constant — ~95 % of the way in 0.6 s
  let last = performance.now();
  let simT = uniforms.uTime.value;
  let raf: number | null = null;

  function resize(): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  function frame(now: number): void {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);
    const k = 1 - Math.exp(-dt / TAU);

    // 7 s breathing sine, 0..1.
    const breathPhase = (now / 1000) * ((Math.PI * 2) / 7);
    const breath = Math.sin(breathPhase) * 0.5 + 0.5;

    cur.amp = cur.amp + (tgt.amp - cur.amp) * k;
    cur.speed = cur.speed + (tgt.speed - cur.speed) * k;
    cur.glow = cur.glow + (tgt.glow - cur.glow) * k;
    cur.breath = cur.breath + (tgt.breath - cur.breath) * k;

    uniforms.uColor.value.lerp(targetColor, k);
    simT += dt * (reduce ? 0 : 1); // reduced motion: freeze noise time
    uniforms.uTime.value = simT;
    uniforms.uSpeed.value = cur.speed;
    uniforms.uAmp.value = cur.amp * (1 + (breath - 0.5) * 0.28 * cur.breath);
    uniforms.uGlow.value = cur.glow * (0.82 + breath * 0.18);

    const scale = 1 + (breath - 0.5) * 0.03 * cur.breath;
    grp.scale.setScalar(scale);

    if (!reduce) {
      grp.rotation.y += dt * 0.16;
      grp.rotation.x += dt * 0.07;
      grp.rotation.z = Math.sin((now / 1000) * 0.12) * 0.09;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setTarget,
    resize,
    dispose(): void {
      if (raf !== null) cancelAnimationFrame(raf);
      // Repo perf contract: dispose EVERY three.js resource (the prototype
      // only disposed the renderer — geometries/materials are added here).
      wireGeometry.dispose();
      glowGeometry.dispose();
      wireMat.dispose();
      glowMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the GPU context slot now, not at GC
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    },
  };
}
