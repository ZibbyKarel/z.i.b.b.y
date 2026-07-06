import * as THREE from "three";
import { type BackgroundLayer, createBackgroundLayer } from "./backgroundLayer";
import { type ConstellationLayer, createConstellationLayer } from "./constellationLayer";
import { type DispatchLayer, createDispatchLayer } from "./dispatchLayer";
import { type DockLayer, createDockLayer } from "./dockLayer";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { type RingsLayer, createRingsLayer } from "./ringsLayer";
import { orbTarget } from "./modeVisuals";
import { resolveSceneTokens } from "./tokens";
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
  /** Fire a dispatch reaction toward an agent's avatar (a `tool` event named it):
   * a beam races out and back, the avatar flares, rings bloom (Tier 5). No-op if
   * the agent isn't in the constellation (e.g. a pipeline-only dispatch). */
  triggerDispatch(agentId: string): void;
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
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const orb: OrbLayer = createOrbLayer();
  orbScene.add(orb.object3d);

  // --- Constellation (Tier 4). Its sprites render in the orb scene (shared camera,
  // transparent); its DOM labels live in an overlay above the canvases. Hidden on
  // small mobile — the roster would clutter a phone-width viewport. ---
  const labelRoot = document.createElement("div");
  labelRoot.setAttribute("data-scene-layer", "labels");
  labelRoot.style.position = "absolute";
  labelRoot.style.inset = "0";
  labelRoot.style.overflow = "hidden";
  labelRoot.style.pointerEvents = "none";
  container.appendChild(labelRoot);
  const constellation: ConstellationLayer = createConstellationLayer(labelRoot);
  orbScene.add(constellation.object3d);
  constellation.setAgents(mobile ? [] : initial.agents);

  // --- Rings (Tier 5): helix around the orb during thinking/tool. ---
  const rings: RingsLayer = createRingsLayer();
  orbScene.add(rings.object3d);

  // --- Dispatch beams (Tier 5): fired on a tool event naming an agent. ---
  const dispatch: DispatchLayer = createDispatchLayer();
  orbScene.add(dispatch.object3d);

  // --- Dock (Tier 5): a DOM bar of the running/queued agents & pipelines. ---
  const dockRoot = document.createElement("div");
  dockRoot.setAttribute("data-scene-layer", "dock");
  container.appendChild(dockRoot);
  const dock: DockLayer = createDockLayer(container, dockRoot);
  dock.setItems(initial.dock);

  // agentId → accent colour, kept in sync with the roster for dispatch beams.
  const agentColors = new Map<string, THREE.Color>();
  const dockTargets = new Map<string, { x: number; y: number }>();
  function syncRoster(next: SceneInputs) {
    agentColors.clear();
    for (const a of next.agents) agentColors.set(a.id, new THREE.Color(a.color));
    // Working pulse: agents with a live run (present in the dock).
    constellation.setWorking(
      new Set(next.dock.filter((d) => d.kind === "agent" && d.targetId).map((d) => d.targetId!)),
    );
    dock.setItems(next.dock);
  }
  syncRoster(initial);

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

    // Which agents are docked this frame (a live run with a dock chip) → fly-to.
    dockTargets.clear();
    for (const d of inputs.dock) {
      if (d.kind !== "agent" || !d.targetId) continue;
      const pos = dock.chipScreenPos(d.targetId);
      if (pos) dockTargets.set(d.targetId, pos);
    }

    constellation.update(dt, elapsed, {
      camera,
      width: container.clientWidth || 1,
      height: container.clientHeight || 1,
      reducedMotion: inputs.reducedMotion,
      dockTargets,
    });
    dispatch.update(dt, (id) => constellation.positionOf(id));

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
      constellation.setAgents(mobile ? [] : next.agents);
      syncRoster(next);
    },
    pushActivity(chars) {
      energy = Math.min(1, energy + Math.max(1, chars) * ENERGY_PER_CHAR);
    },
    flashComplete() {
      flash = 1;
    },
    triggerDispatch(agentId) {
      const color = agentColors.get(agentId) ?? new THREE.Color(resolveSceneTokens().accent);
      constellation.flare(agentId);
      dispatch.fire(agentId, color);
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
      constellation.dispose();
      rings.dispose();
      dispatch.dispose();
      dock.dispose();
      labelRoot.remove();
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
