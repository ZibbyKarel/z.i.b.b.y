import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import * as THREE from "three";
import { type BackgroundLayer, createBackgroundLayer } from "./backgroundLayer";
import { hubSlots, octagonSlots } from "./clusterGeometry";
import { type DockLayer, createDockLayer } from "./dockLayer";
import { type OrbTarget, miniOrbTarget, orbTarget } from "./modeVisuals";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { type RingsLayer, createRingsLayer } from "./ringsLayer";
import type { SceneInputs, SceneSubsystem, SubsystemProjection } from "./sceneTypes";
import { resolveForegroundFaintHex } from "./tokens";

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
  /** Push the latest subsystem roster (phase 95) — drives the 8 mini-orbs'
   * show/hide and per-state visual. Eased toward, never snapped. */
  setSubsystems(list: SceneSubsystem[]): void;
  /** Subscribe to per-frame mini-orb projections (world → container px + on-screen
   * radius) — the {@link SubsystemOrbsOverlay} positions its DOM nodes from these
   * without re-rendering React. Returns an unsubscribe. Called immediately once with
   * the current projections so the overlay can place nodes before the next frame. */
  subscribeProjections(cb: (projections: SubsystemProjection[]) => void): () => void;
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

/** The central orb (and its halo) render at (just under) half scale — the subsystem
 * octagon is the scene's centerpiece now, ringing a smaller orb rather than a
 * full-bleed one. Its world radius is `ORB_SCALE`; its glow shell reaches
 * `ORB_SCALE × 1.25`. Trimmed a hair from 0.5 so the compact top-third octagon's
 * inner hub octagon clears the glow with a clearly visible gap while the orb stays
 * unmistakably the dominant object (~2.9× a mini-orb). */
const ORB_SCALE = 0.46;

/**
 * Phase 95 mini-orb + WebGL-net geometry, all in cluster-LOCAL world units (the
 * `cluster` group carries the {@link CLUSTER_Y} translation, scale 1). Tuned as a
 * set so the net HUGS the central orb — the headline fix over phase 94's
 * separately-calibrated SVG overlay:
 *
 *  - {@link MINI_ORB_WORLD_RADIUS} — a mini-orb's world radius (its group scale). A
 *    smaller sibling of the central orb (`ORB_SCALE = 0.5`).
 *  - {@link NODE_RING_RADIUS} — the octagon the 8 mini-orbs sit on (forge at the
 *    bottom). Well OUTSIDE the hub, so the spokes are long and radial.
 *  - {@link HUB_RADIUS} — the inner octagon that rings the orb. Must clear the
 *    central orb's glow (world radius `ORB_SCALE × 1.25 = 0.625`) with a visible gap,
 *    and sit well inside the node ring so nothing in the net ever touches the orb.
 */
const MINI_ORB_WORLD_RADIUS = 0.16;
const NODE_RING_RADIUS = 0.85;
const HUB_RADIUS = 0.7;

/**
 * How far up (world Y) the whole `cluster` group (central orb + mini-orbs + net) is
 * translated so it lands in the TOP THIRD of the page (phase 94's composition,
 * restored) — the {@link SubsystemOrbsOverlay} tracks the controller's per-frame
 * projections, so it can never desync from this offset (phase 94's SVG overlay had
 * to hardcode the matching CSS `top`; this replaces that coupling entirely). Camera
 * is untouched — still `lookAt(0, 0, 0)` — only the cluster moves, which keeps the
 * background glow's projected offset a pure function of `CLUSTER_Y` and the fixed
 * FOV/distance (see {@link glowCenterFromClusterY}). Paired with the COMPACT octagon
 * ({@link NODE_RING_RADIUS} snug just outside the central orb's glow), so the whole
 * cluster (all 8 mini-orbs + their labels) sits in the upper region and the lower
 * half+ of the page stays clear for the transcript — no chat bubble ever overlaps a
 * mini-orb, and the top mini-orb (Beacon) clears the top bar.
 */
const CLUSTER_Y = 1.22;

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

  // The whole scene centerpiece — central orb + rings + the 8 subsystem mini-orbs +
  // the WebGL net — lives in ONE `cluster` group raised into the upper page
  // (CLUSTER_Y). Because the net and the mini-orbs share this exact transform with
  // the central orb, the net can HUG the orb by construction (phase 95's headline fix
  // over phase 94's separately-calibrated SVG overlay). The camera keeps looking at
  // the world origin (never re-targeted), so this translation is the ONLY thing that
  // moves the cluster on screen. All per-frame easing stays relative to this group,
  // so nothing snaps.
  const cluster = new THREE.Group();
  cluster.position.y = CLUSTER_Y;
  orbScene.add(cluster);

  // The central orb + its halo render at half scale (ORB_SCALE) inside their own
  // `core` sub-group, so the octagon rings a smaller orb. `core` sits at the cluster
  // origin (the cluster carries the CLUSTER_Y offset now).
  const core = new THREE.Group();
  core.scale.setScalar(ORB_SCALE);
  cluster.add(core);

  // The background's behind-orb glow pools at the same projected position as the
  // raised cluster, not screen centre — a pure function of CLUSTER_Y/camera constants
  // (see glowCenterFromClusterY), so it never needs recomputing per frame.
  background.setGlowCenter(0, glowCenterFromClusterY(CLUSTER_Y));

  const orb: OrbLayer = createOrbLayer();
  core.add(orb.object3d);

  // --- Rings (Tier 5): a soft halo around the orb during live states. ---
  const rings: RingsLayer = createRingsLayer();
  core.add(rings.object3d);

  // --- Mini-orbs (phase 95): one per registry subsystem, reusing the central orb's
  // shader via the generalized factory — smaller (group scale MINI_ORB_WORLD_RADIUS),
  // lower detail, tinted to the subsystem's registry colour. Arranged on a regular
  // octagon (forge at the bottom) as direct children of the cluster group. ---
  interface MiniOrb {
    id: SubsystemId;
    layer: OrbLayer;
    /** The mini-orb's world centre (for projection) — cluster-local + CLUSTER_Y. */
    worldPos: THREE.Vector3;
    /** The per-state target it eases toward; defaults to `klid` until setSubsystems. */
    target: OrbTarget;
    present: boolean;
  }
  const nodeSlots = octagonSlots(NODE_RING_RADIUS);
  const minis: MiniOrb[] = SUBSYSTEMS.map((subsystem, index) => {
    const slot = nodeSlots[index]!;
    const layer = createOrbLayer({
      seedColor: subsystem.color,
      detail: 2,
      glowScale: 1.35,
      glowStrength: 0.4,
      glowSegments: 24,
    });
    layer.object3d.position.set(slot.x, slot.y, 0);
    layer.object3d.scale.setScalar(MINI_ORB_WORLD_RADIUS);
    cluster.add(layer.object3d);
    return {
      id: subsystem.id,
      layer,
      worldPos: new THREE.Vector3(slot.x, CLUSTER_Y + slot.y, 0),
      target: miniOrbTarget(subsystem.color, "klid"),
      present: true,
    };
  });

  // --- WebGL net (phase 95): the inner octagon (hub→hub, ringing the orb) + long
  // radial spokes (hub→mini-orb). One additive faint LineSegments in the shared
  // foreground-faint tone — the same neutral "wiring" colour the retired SVG web
  // used. Nothing in it ever overlaps the central orb: the innermost points are the
  // hub vertices (HUB_RADIUS), which clear the orb's glow with a gap. ---
  const hubVerts = hubSlots(HUB_RADIUS);
  const netPositions: number[] = [];
  for (let i = 0; i < hubVerts.length; i++) {
    const hub = hubVerts[i]!;
    const nextHub = hubVerts[(i + 1) % hubVerts.length]!;
    const node = nodeSlots[i]!;
    // Inner octagon edge (hub → next hub).
    netPositions.push(hub.x, hub.y, 0, nextHub.x, nextHub.y, 0);
    // Spoke (hub → its mini-orb).
    netPositions.push(hub.x, hub.y, 0, node.x, node.y, 0);
  }
  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute("position", new THREE.Float32BufferAttribute(netPositions, 3));
  const netMaterial = new THREE.LineBasicMaterial({
    // Neutral "wiring" tone (the same `--color-foreground-faint` the retired SVG used)
    // but at a crisp foreground alpha — with the background node-web toned right down
    // (backgroundLayer pass 2), this reads as deliberate structure ringing the orb,
    // not ambient sky. Additive over the dark nebula gives it a clean glow.
    color: new THREE.Color(resolveForegroundFaintHex()),
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const net = new THREE.LineSegments(netGeometry, netMaterial);
  cluster.add(net);

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

  // --- Projection plumbing (phase 95): each frame, project every mini-orb's world
  // centre to CONTAINER pixels + an on-screen radius, and push to subscribers (the
  // React overlay). Allocation-light: a stable array of projection objects is mutated
  // in place, and the temp vectors are reused. ---
  const projectionSubscribers = new Set<(p: SubsystemProjection[]) => void>();
  const projections: SubsystemProjection[] = minis.map((m) => ({ id: m.id, x: 0, y: 0, r: 0 }));
  const projCenter = new THREE.Vector3();
  const projEdge = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();

  function computeProjections() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // Ensure the camera matrices are current regardless of call order relative to
    // render (drift moves the camera every frame) — cheap for a single camera.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    // The camera's world-space right axis (drift rotates it slightly) — offset the
    // edge sample along it so the on-screen radius is measured across the screen,
    // not along a fixed world axis.
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i]!;
      const proj = projections[i]!;
      projCenter.copy(mini.worldPos).project(camera);
      projEdge.copy(mini.worldPos).addScaledVector(cameraRight, MINI_ORB_WORLD_RADIUS).project(camera);
      const cx = (projCenter.x * 0.5 + 0.5) * w;
      const cy = (-projCenter.y * 0.5 + 0.5) * h;
      const ex = (projEdge.x * 0.5 + 0.5) * w;
      const ey = (-projEdge.y * 0.5 + 0.5) * h;
      proj.x = cx;
      proj.y = cy;
      proj.r = Math.hypot(ex - cx, ey - cy);
    }
  }

  function emitProjections() {
    if (projectionSubscribers.size === 0) return;
    computeProjections();
    for (const cb of projectionSubscribers) cb(projections);
  }

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

    // Mini-orbs (phase 95): each eases toward its per-state target (nothing snaps).
    // A hidden (not-present) mini-orb still eases in the background so it fades in
    // correctly when it returns. No completion flash on the sub-orbs (that's the
    // central orb's alone).
    for (const mini of minis) {
      mini.layer.object3d.visible = mini.present;
      if (mini.present) mini.layer.update(dt, mini.target, inputs.reducedMotion, 0);
    }

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
    // Push the mini-orb projections to the overlay AFTER render (camera matrices are
    // current) — a no-op with no subscribers (jsdom, or overlay not yet mounted).
    emitProjections();
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
    setSubsystems(list) {
      // Key by id so a severity-sorted or momentarily-short feed never reflows the
      // fixed octagon — each mini-orb reads its own entry (missing → not present).
      const byId = new Map(list.map((s) => [s.id, s]));
      for (const mini of minis) {
        const next = byId.get(mini.id);
        if (next) {
          mini.present = next.present;
          mini.target = miniOrbTarget(next.color, next.state);
        } else {
          mini.present = false;
        }
      }
    },
    subscribeProjections(cb) {
      projectionSubscribers.add(cb);
      // Fire once immediately so the overlay can place its nodes before the next
      // frame (and even while paused).
      computeProjections();
      cb(projections);
      return () => {
        projectionSubscribers.delete(cb);
      };
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
      projectionSubscribers.clear();
      orb.dispose();
      for (const mini of minis) mini.layer.dispose();
      netGeometry.dispose();
      netMaterial.dispose();
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
