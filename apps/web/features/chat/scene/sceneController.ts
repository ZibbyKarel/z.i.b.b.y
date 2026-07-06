import * as THREE from "three";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { orbTarget } from "./modeVisuals";
import type { SceneInputs } from "./sceneTypes";

/**
 * The vanilla-three controller that owns the whole cosmic scene: its renderer(s),
 * camera, layers, and the single `requestAnimationFrame` loop that drives them.
 * Vanilla three (not react-three-fiber) is deliberate — one loop has to drive both
 * the orb (full quality) and, from Tier 2 on, the background (droppable to half
 * framerate), which r3f's per-`<Canvas>` loop can't express cleanly.
 *
 * React never touches three: {@link CosmicScene} instantiates this once, pushes
 * derived chat state through {@link SceneController.setInputs} / `pushActivity`,
 * and disposes on unmount. Everything eases toward its target every frame — the
 * scene's north star is "alive, not animated": nothing ever snaps.
 */
export interface SceneController {
  /** Push the latest derived chat state (mode/agents/dock/reduced-motion). */
  setInputs(inputs: SceneInputs): void;
  /** Bump the streaming energy signal — called once per delta with the token
   * chunk length (Tier 3). Energy attacks fast and decays slowly inside the loop. */
  pushActivity(chars: number): void;
  /** Pause the loop (overlay closed / tab hidden). Idempotent. */
  pause(): void;
  /** Resume without a time jump (the clock is reset so `dt` stays small). Idempotent. */
  resume(): void;
  /** Tear down the loop, remove the canvas, and free all GPU resources. */
  dispose(): void;
}

/** How much a token chunk bumps energy (per char, capped). Tuned so a typical
 * multi-char delta pushes energy near 1 and a trickle keeps it mid-range. */
const ENERGY_PER_CHAR = 0.06;
/** Energy decay per second between chunks — the slow release half of the
 * asymmetric envelope (attack is instant on `pushActivity`). */
const ENERGY_DECAY = 1.6;

const CAMERA_Z = 6;

export function createSceneController(container: HTMLElement, initial: SceneInputs): SceneController {
  let inputs = initial;
  let energy = 0;
  let disposed = false;
  let running = false;
  let rafId = 0;

  // --- Orb renderer (transparent, composited over the background layer added in
  // Tier 2). Full quality, always. ---
  const orbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  orbRenderer.setClearColor(0x000000, 0);
  orbRenderer.domElement.setAttribute("data-scene-layer", "orb");
  applyCanvasStyle(orbRenderer.domElement);
  container.appendChild(orbRenderer.domElement);

  const orbScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const orb: OrbLayer = createOrbLayer();
  orbScene.add(orb.object3d);

  const clock = new THREE.Clock();
  // A slow, ever-present camera drift so even the idle scene breathes (Tier 2
  // deepens this; a gentle version here keeps Tier 1 from ever looking frozen).
  let driftPhase = 0;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    orbRenderer.setPixelRatio(dpr);
    orbRenderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(container);
  resize();

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05); // clamp after a tab-switch stall

    // Energy: instant attack happens in pushActivity; here we only decay.
    energy = Math.max(0, energy - ENERGY_DECAY * dt);

    orb.update(dt, orbTarget(inputs.mode, energy), inputs.reducedMotion);

    // Gentle camera parallax — disabled under reduced motion.
    if (!inputs.reducedMotion) {
      driftPhase += dt * 0.15;
      camera.position.x = Math.sin(driftPhase) * 0.18;
      camera.position.y = Math.cos(driftPhase * 0.8) * 0.12;
      camera.lookAt(0, 0, 0);
    }

    orbRenderer.render(orbScene, camera);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    clock.getDelta(); // drop the accumulated gap so the first dt is small
    rafId = requestAnimationFrame(frame);
  }

  start();

  return {
    setInputs(next) {
      inputs = next;
    },
    pushActivity(chars) {
      energy = Math.min(1, energy + Math.max(1, chars) * ENERGY_PER_CHAR);
    },
    pause() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    },
    resume() {
      start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      orb.dispose();
      orbRenderer.dispose();
      orbRenderer.domElement.remove();
    },
  };
}

/** Full-bleed, non-interactive canvas stacked in the scene container. */
function applyCanvasStyle(canvas: HTMLCanvasElement) {
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
}
