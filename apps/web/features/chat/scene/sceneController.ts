import * as THREE from "three";
import { type BackgroundLayer, createBackgroundLayer } from "./backgroundLayer";
import { type DockLayer, createDockLayer } from "./dockLayer";
import { orbTarget } from "./modeVisuals";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { type RingsLayer, createRingsLayer } from "./ringsLayer";
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
  /** Fire the brief completion flash (a `done` turn) — an `ok`-green pulse on the
   * orb and its background glow that decays back to the current mode. */
  flashComplete(): void;
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
/** Vertical field of view (degrees) — matches the `PerspectiveCamera` constructor
 * below; kept as its own constant so {@link CLUSTER_Y}'s screen-position maths
 * stays in sync with the camera it's projected through. */
const CAMERA_FOV_DEG = 45;

/** The orb (and its halo) render at half scale — the subsystem web is the scene's
 * centerpiece now, ringing a smaller orb rather than a full-bleed one. */
const ORB_SCALE = 0.5;

/**
 * Phase 94 ("top third, not centre"): how far up (world Y) the orb/rings `core`
 * group is translated so the cluster lands in the top third of the page instead of
 * dead centre — the ChatScreen's SVG octagon overlay is positioned in CSS to match
 * this exact projected screen offset (see `ChatScreen.tsx`'s `top-[19.8%]` wrapper),
 * so the two stay concentric. Camera is untouched — still `lookAt(0, 0, 0)` — only
 * the cluster moves, which is what keeps the projected offset a pure function of
 * `CLUSTER_Y` and the camera's fixed FOV/distance (see {@link glowCenterFromClusterY}).
 */
const CLUSTER_Y = 1.5;

/**
 * The world-Y offset {@link CLUSTER_Y} projected into the background sky shader's
 * centred, aspect-corrected `p`-space (screen centre `(0,0)`, `+y` up) — pure
 * perspective-projection trig, no live camera state needed, since the camera's
 * `lookAt` target and distance from the (raised) cluster are both fixed constants.
 * Kept as one small function (rather than a hardcoded literal) so a future change
 * to `CLUSTER_Y`/`CAMERA_Z`/FOV can't silently desync the glow from the orb.
 */
function glowCenterFromClusterY(clusterY: number): number {
  const halfHeightWorld = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360) * CAMERA_Z;
  const ndcY = clusterY / halfHeightWorld;
  return ndcY / 2;
}

export function createSceneController(
  container: HTMLElement,
  initial: SceneInputs,
): SceneController {
  let inputs = initial;
  let energy = 0;
  let flash = 0;
  let disposed = false;
  let running = false;
  let rafId = 0;

  const mobile = (container.clientWidth || window.innerWidth || 0) < 640;
  // Low-power devices (mobile, or few cores) get an extra-frugal background: lower
  // resolution on top of the always-on half-framerate. The orb stays full quality.
  const lowPower = mobile || (navigator.hardwareConcurrency ?? 8) <= 4;
  let frameCount = 0;

  // --- Background renderer (furthest back, opaque). Its own renderer so it can be
  // dropped to half framerate on weak devices (Tier 6) without the orb stuttering.
  // Appended FIRST so it paints under the orb canvas. ---
  const bgRenderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
  bgRenderer.domElement.setAttribute("data-scene-layer", "background");
  applyCanvasStyle(bgRenderer.domElement);
  container.appendChild(bgRenderer.domElement);
  const background: BackgroundLayer = createBackgroundLayer(mobile);

  // --- Orb renderer (transparent, composited over the background). Full quality,
  // always. Appended second so it stacks on top. ---
  const orbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  orbRenderer.setClearColor(0x000000, 0);
  orbRenderer.domElement.setAttribute("data-scene-layer", "orb");
  applyCanvasStyle(orbRenderer.domElement);
  container.appendChild(orbRenderer.domElement);

  const orbScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  // The orb and its halo live in a half-scale core group so the subsystem web (the
  // centerpiece now) rings a smaller orb — see ORB_SCALE. Phase 94 raises the whole
  // group into the top third (CLUSTER_Y) — the camera keeps looking at the world
  // origin (never re-targeted), so this translation is the ONLY thing that moves
  // the cluster on screen. The per-frame pulse/ring easing stays relative to this
  // group, so nothing snaps.
  const core = new THREE.Group();
  core.scale.setScalar(ORB_SCALE);
  core.position.y = CLUSTER_Y;
  orbScene.add(core);

  // The background's behind-orb glow pools at the same projected position as the
  // raised orb, not screen centre — a pure function of CLUSTER_Y/camera constants
  // (see glowCenterFromClusterY), so it never needs recomputing per frame.
  background.setGlowCenter(0, glowCenterFromClusterY(CLUSTER_Y));

  const orb: OrbLayer = createOrbLayer();
  core.add(orb.object3d);

  // --- Rings (Tier 5): a soft halo around the orb during live states. ---
  const rings: RingsLayer = createRingsLayer();
  core.add(rings.object3d);

  // --- Dock (Tier 5): a DOM bar of the running/queued agents & pipelines. ---
  const dockRoot = document.createElement("div");
  dockRoot.setAttribute("data-scene-layer", "dock");
  container.appendChild(dockRoot);
  const dock: DockLayer = createDockLayer(container, dockRoot);
  dock.setItems(initial.dock);

  const clock = new THREE.Clock();
  let elapsed = 0;
  // A slow, ever-present camera drift so even the idle scene breathes (Tier 2
  // deepens this; a gentle version here keeps Tier 1 from ever looking frozen).
  let driftPhase = 0;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    orbRenderer.setPixelRatio(dpr);
    orbRenderer.setSize(w, h, false);
    // The background can afford a lower resolution (it's soft and out of focus) —
    // lower still on low-power devices.
    bgRenderer.setPixelRatio(Math.min(dpr, lowPower ? 1 : 1.5));
    bgRenderer.setSize(w, h, false);
    background.setAspect(w / h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dock.measure();
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(container);
  resize();

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05); // clamp after a tab-switch stall
    elapsed += dt;

    // Energy: instant attack happens in pushActivity; here we only decay.
    energy = Math.max(0, energy - ENERGY_DECAY * dt);
    // Completion flash decays over ~0.8s (attack is instant in flashComplete).
    flash = Math.max(0, flash - dt / 0.8);

    const target = orbTarget(inputs.mode, energy);
    orb.update(dt, target, inputs.reducedMotion, flash);
    rings.update(dt, elapsed, target.rings, inputs.reducedMotion);

    // Gentle camera parallax — disabled under reduced motion.
    if (!inputs.reducedMotion) {
      driftPhase += dt * 0.15;
      camera.position.x = Math.sin(driftPhase) * 0.18;
      camera.position.y = Math.cos(driftPhase * 0.8) * 0.12;
      camera.lookAt(0, 0, 0);
    }

    // Background always advances (wall-clock steady) but renders every OTHER frame
    // — at ~30fps its slow drift is indistinguishable, and the orb keeps every
    // frame. The skipped frame keeps its last-drawn contents on the canvas.
    background.update(dt, { orbColor: orb.currentColor, reducedMotion: inputs.reducedMotion });
    if (frameCount % 2 === 0) background.render(bgRenderer, camera);
    orbRenderer.render(orbScene, camera);
    frameCount++;
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
      dock.setItems(next.dock);
    },
    pushActivity(chars) {
      energy = Math.min(1, energy + Math.max(1, chars) * ENERGY_PER_CHAR);
    },
    flashComplete() {
      flash = 1;
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
      background.dispose();
      rings.dispose();
      dock.dispose();
      dockRoot.remove();
      orbRenderer.dispose();
      orbRenderer.domElement.remove();
      bgRenderer.dispose();
      bgRenderer.domElement.remove();
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
