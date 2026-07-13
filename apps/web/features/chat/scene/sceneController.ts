import { SUBSYSTEMS, type SubsystemId, type SubsystemState } from "@zibby/contracts";
import * as THREE from "three";
import { particleDuration } from "../../subsystems/components/SubsystemWeb/particle-mapping";
import { type BackgroundLayer, createBackgroundLayer } from "./backgroundLayer";
import {
  HUB_RADIUS,
  MINI_ORB_WORLD_RADIUS,
  MITOSIS_TOTAL_DURATION,
  NODE_RING_RADIUS,
  NODE_RING_RADIUS_X,
  REGISTRY_ORDER,
  easeOutBack,
  easeOutCubic,
  ellipseSlots,
  hubSlots,
  mitosisProgress,
  orbFlightSlots,
  resolveFlightEndpoints,
} from "./clusterGeometry";
import { CONNECTORS_OPACITY, type ConnectorsLayer, createConnectorsLayer } from "./connectorsLayer";
import { type DockLayer, createDockLayer } from "./dockLayer";
import { type OrbTarget, miniOrbTarget, orbTarget } from "./modeVisuals";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { type OrbitFieldLayer, createOrbitFieldLayer } from "./orbitFieldLayer";
import { type ParticleLayer, createParticleLayer } from "./particleLayer";
import { type RingsLayer, createRingsLayer } from "./ringsLayer";
import type { SceneInputs, SceneSubsystem, SubsystemProjection } from "./sceneTypes";

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
  /** Task B4 — push `subsystemLoad.ts`'s latest active-run tally per subsystem;
   * forwarded verbatim to the orbit field's `setCount` (absent ids reset to 0).
   * Wakes a parked scene (with the settle window) only on a genuine change,
   * mirroring `setSubsystems`' own no-op-refresh guard. */
  setSubsystemLoad(counts: Partial<Record<SubsystemId, number>>): void;
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
  /** Phase 97 — restore a handoff particle for one real dispatch/report event.
   * Exactly one of `from`/`to` is `"orb"` (the mapping in `particle-mapping.ts`'s
   * `flightForEvent` guarantees this); the other is the owning subsystem. Resolves
   * the two cluster-local endpoints (the orb side → a point on that subsystem's
   * spoke just outside the orb's rendered glow — {@link ORB_FLIGHT_RADIUS} — so the
   * mote visibly emanates from the orb's surface, crosses the whole inner octagon,
   * and never crosses the orb's centre; the subsystem side → its mini-orb's live
   * position) and hands off to the fixed
   * particle pool with a jittered duration (`particleDuration`, reused verbatim).
   * Under reduced motion: no travel — a brief static glow held at the
   * DESTINATION only. Exposed on `window.__cosmicScene` outside production, same
   * as `replayEntry`/`scrubEntry`, so visual verification can fire flights without
   * a real run. */
  emitFlight(from: SubsystemId | "orb", to: SubsystemId | "orb", color: string): void;
  /** Pause the loop (overlay closed / tab hidden). Idempotent. */
  pause(): void;
  /** Resume without a time jump (the clock is reset so `dt` stays small). Idempotent. */
  resume(): void;
  /** Tear down the loop, remove the canvas, and free all GPU resources. */
  dispose(): void;
  /** DEV/TESTING ONLY (phase 96) — replay the one-shot mitosis entry animation
   * from the current frame, as if the controller had just been created. A
   * no-op under reduced motion (there is nothing to replay — the contract is
   * "no motion"). Lets visual verification retrigger the fork without a full
   * page reload (whose navigation overhead makes reload-based timing
   * unreliable). Exposed on `window.__cosmicScene` outside production. */
  replayEntry(): void;
  /** DEV/TESTING ONLY (phase 96) — freeze the RAF loop and force the entry
   * animation to an EXACT elapsed time `t` (seconds), rendering once so a
   * screenshot captures a deterministic frame regardless of real wall-clock or
   * tool round-trip timing (unlike `replayEntry`, which keeps advancing in real
   * time). A no-op under reduced motion. Call `resume()` to return to normal
   * playback afterward. Exposed on `window.__cosmicScene` outside production. */
  scrubEntry(t: number): void;
}

/** How much a token chunk bumps energy (per char, capped). Tuned so a typical
 * multi-char delta pushes energy near 1 and a trickle keeps it mid-range. */
const ENERGY_PER_CHAR = 0.06;
/** Energy decay per second between chunks — the slow release half of the
 * asymmetric envelope (attack is instant on `pushActivity`). */
const ENERGY_DECAY = 1.6;

/** Phase 117b (variant 4b) — power-saver's target frame interval (~30fps), in
 * seconds. `frame()` still schedules a `requestAnimationFrame` every tick (so
 * timing stays accurate and the browser doesn't further throttle the callback)
 * but only runs the update+render body once the wall-clock accumulator reaches
 * this interval. Composes with the existing background half-rate skip
 * (`frameCount % 2`) for a further /2 on top. */
const POWER_SAVER_FRAME_INTERVAL_S = 1 / 30;

/** Phase 117c (variant 1) — the always-on idle demand-render's resting cadence,
 * in seconds. Only applied outside power-saver, and only while genuinely at
 * rest (see {@link isAtRest}) with the camera-parallax drift still enabled
 * (`!reducedMotion`) — the drift is a continuous animation so the loop can't
 * fully park the way {@link SETTLE_DURATION_S}'s reduced-motion/power-saver
 * case can, but ~10fps is a fraction of the full-rate GPU cost while the
 * drift stays wall-clock-smooth (each throttled tick still runs with the
 * accumulated real `dt`, not a fixed step). Any activity restores full rate
 * on the very next `requestAnimationFrame` (the loop keeps scheduling every
 * real frame even while throttled — only the update+render body is skipped). */
const IDLE_FRAME_INTERVAL_S = 1 / 10;

/** Phase 117b — how long the power-saver loop must keep running after a
 * target-CHANGING wake (a mode change or a subsystem status/colour change, and a
 * `resume()` that may have missed a change while hidden) before it is allowed to
 * freeze again. The orb/mini-orb eases are an asymptotic `damp` at
 * `DAMPING_RATE = 5` (`orbLayer.ts`) — time constant 0.2s — so ~1s (five time
 * constants) lets a colour/scale transition visually complete before the loop
 * parks. Without this the loop would run a single tick and re-freeze the orb
 * partway to its new target (e.g. stuck pinkish instead of fully red).
 * Activity-only wakes (`pushActivity`/`flashComplete`/`emitFlight`) don't need it
 * — their own decaying energy/flash/particle signals already keep the scene
 * non-resting for their whole duration. */
const SETTLE_DURATION_S = 1;

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
 * separately-calibrated SVG overlay. The actual constants ({@link MINI_ORB_WORLD_RADIUS},
 * {@link NODE_RING_RADIUS}, {@link HUB_RADIUS}, {@link NODE_OCTAGON_RADIUS}) live in
 * `clusterGeometry.ts` (imported above) instead of here, so `clusterGeometry.test.ts`
 * can assert the REAL tuned values — see that module's `NET_GEOMETRY` export:
 *
 *  - `MINI_ORB_WORLD_RADIUS` — a mini-orb's world radius (its group scale). A
 *    smaller sibling of the central orb (`ORB_SCALE = 0.46`).
 *  - `NODE_RING_RADIUS` — the ring the 8 mini-orbs sit on (forge at the
 *    bottom). Well OUTSIDE the hub, so the spokes are long and radial. Phase 107
 *    pushed this from 0.85 to 1.05 to clear `HUB_RADIUS` plus a deliberate
 *    connector gap ({@link NODE_LINK_GAP} in `clusterGeometry.ts`) — see the
 *    no-overlap invariant on the net block below. Task B2 (Velín-D retune)
 *    widened the ring into an ELLIPSE — this is now its vertical radius only;
 *    {@link NODE_RING_RADIUS_X} is the (wider) horizontal radius. The hub ring
 *    and orb-flight ring stay regular octagons.
 *  - `HUB_RADIUS` — the inner octagon that rings the orb. Must clear the
 *    central orb's glow (world radius `ORB_SCALE × 1.4 = 0.644`) with a visible gap,
 *    and sit well inside the node ring so nothing in the net ever touches the orb.
 *  - `NODE_OCTAGON_RADIUS` — the radius of the small octagon wrapping EACH
 *    mini-orb, ringing it the same way `HUB_RADIUS`'s octagon rings the central
 *    orb. A touch larger than `MINI_ORB_WORLD_RADIUS` so it visibly clears the
 *    mini-orb's own glow instead of hugging it pixel-tight.
 */

/**
 * Phase 97 legibility pass — the orb-side endpoint a handoff-flight particle
 * actually travels to/from. Deliberately SMALLER than {@link HUB_RADIUS} (the
 * net's own inner-octagon vertex): a flight confined to the hub→node segment
 * (0.7 → 1.05, post phase 107) only crosses 0.35 world units — still a fairly
 * faint tick at full-viewport scale. Sitting just outside the central orb's
 * rendered glow (`ORB_SCALE × 1.4 = 0.644`) instead means a dispatch visibly
 * leaves the orb's surface and crosses the WHOLE inner octagon on its way out
 * (report: the reverse) — a clearly-legible flight, while the 0.026 gap to the
 * glow still guarantees it never passes through the orb itself. Phase 114a
 * widened the glow shell (GLOW_SCALE 1.25→1.4, world radius 0.575→0.644), so
 * this was nudged 0.6→0.67 to stay outside it while remaining inside HUB_RADIUS.
 */
const ORB_FLIGHT_RADIUS = 0.67;

// Phase 96 — the one-shot "mitosis" entry animation: on controller creation the
// 8 mini-orbs bud out of the central orb (cluster-local origin) and travel to
// their elliptical node-ring slot (task B2) while growing from scale 0 to
// MINI_ORB_WORLD_RADIUS, staggered per index (see clusterGeometry's
// mitosisProgress). Purely additive on top of the phase-95 rest state: once
// every mini-orb's progress reaches 1, everything below snaps to its exact rest
// value and is never touched again (no re-trigger).
/** The connectors' rest opacity — imported from `connectorsLayer.ts` (task B3)
 * rather than redefined here, so the entry fade-in below and the layer's own
 * material construction can never drift apart. Kept under its retired
 * `NET_OPACITY` name in spirit only; see {@link CONNECTORS_OPACITY}. */
/** The connectors start this fraction of their final scale (a gentle
 * scale-in, not a pop) at the moment they begin to fade in. */
const NET_ENTRY_START_SCALE = 0.85;
/** The connectors stay fully invisible for the first half of the entry
 * animation, then fade/scale in over the second half — they must never draw
 * to empty space while the mini-orbs are still bunched near the centre. */
const NET_FADE_START_FRACTION = 0.5;
/** Central-orb "division" impulse (a brief scale pop at entry t≈0, decaying
 * fast) that sells the mitosis moment without lingering into the travel phase. */
const ENTRY_IMPULSE_PEAK = 0.15;
const ENTRY_IMPULSE_DECAY_RATE = 10; // 1/s — ~0 well before ENTRY_IMPULSE_WINDOW
const ENTRY_IMPULSE_WINDOW = 0.6; // s

/**
 * How far up (world Y) the whole `cluster` group (central orb + mini-orbs + net) is
 * translated so it lands in the TOP THIRD of the page (phase 94's composition,
 * restored) — the {@link SubsystemOrbsOverlay} tracks the controller's per-frame
 * projections, so it can never desync from this offset (phase 94's SVG overlay had
 * to hardcode the matching CSS `top`; this replaces that coupling entirely). Camera
 * is untouched — still `lookAt(0, 0, 0)` — only the cluster moves, which keeps the
 * background glow's projected offset a pure function of `CLUSTER_Y` and the fixed
 * FOV/distance (see {@link glowCenterFromClusterY}). Paired with the COMPACT ring
 * ({@link NODE_RING_RADIUS}, pushed from 0.85 to 1.05 in phase 107 to clear the hub
 * octagon plus a connector gap — see `clusterGeometry.ts`'s `NET_GEOMETRY`; task B2
 * widened it into an ellipse via {@link NODE_RING_RADIUS_X}, vertical radius
 * unchanged), so the whole cluster (all 8 mini-orbs + their labels) sits in the
 * upper region and the lower half+ of the page stays clear for the transcript —
 * no chat bubble ever overlaps a mini-orb, and the top mini-orb (Beacon) clears
 * the top bar. Phase 107 widened the ring, which nudges every mini-orb slightly
 * closer to the viewport edge than phase 94/98's tuning assumed — verify with a
 * screenshot that nothing clips (mini-orb, its octagon, or its label) before
 * calling the tune final; if it does, prefer trimming `NODE_LINK_GAP` first,
 * then `NODE_RING_RADIUS`/`NODE_RING_RADIUS_X` themselves.
 */
const CLUSTER_Y = 1.22;

/** Phase 97 — reduced-motion handoff flights: a brief static glow held at the
 * DESTINATION node, no travel. Matches the retired Phase-89 SVG implementation's
 * own `ripple 0.9s` reduced-motion glow duration, so the "felt" pacing of a
 * dispatch/report notification is unchanged by the WebGL rewrite. */
const REDUCED_MOTION_GLOW_DURATION_S = 0.9;

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
  // Phase 97 — a monotonic per-flight counter, folded into `particleDuration`'s
  // deterministic seed (never `Math.random()`) so two flights emitted in the same
  // tick still get visibly different jitter.
  let flightSeq = 0;

  // Phase 117b (variant 4b/5) / 117c (variant 1) — throttled-cadence bookkeeping,
  // shared by both gates. `frameAccum` is the wall-clock accumulator for
  // whichever throttle is active this tick (power-saver's ~30fps floor, or
  // 117c's resting ~10fps while the camera drift is still live) — see
  // `restFrameBudget`. Once the scene reaches rest under a gate that PARKS
  // (power-saver always; non-power-saver only when `reducedMotion` disables the
  // drift), `frame()` sets `running = false` and stops scheduling — the same
  // "loop stopped" signal `pause()` already uses, just reached by a different
  // path — distinct from `hostPaused` (tab hidden / overlay closed via
  // `pause()`), so a real activity signal can `wake()` a scene parked-at-rest
  // but never one that's paused by the host; `resume()` un-pauses and restarts
  // the loop, which — if still genuinely at rest — draws exactly one frame
  // before parking again on its own.
  let frameAccum = 0;
  let hostPaused = false;
  // Phase 117b — while > 0 the power-saver loop must not park (see
  // SETTLE_DURATION_S): a target-changing wake arms it so the eased transition
  // finishes on screen instead of freezing after one tick. Decremented by real
  // `dt` in `tick`.
  let settleTimer = 0;

  const mobile = (container.clientWidth || window.innerWidth || 0) < 640;
  // Low-power devices (mobile, or few cores) get an extra-frugal background: lower
  // resolution on top of the always-on half-framerate. The orb stays full quality.
  const lowPower = mobile || (navigator.hardwareConcurrency ?? 8) <= 4;
  let frameCount = 0;

  // --- Background renderer (furthest back, opaque). Its own renderer so it can be
  // dropped to half framerate on weak devices (Tier 6) without the orb stuttering.
  // Appended FIRST so it paints under the orb canvas. ---
  const bgRenderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
  // ACES tone mapping gives the bright orb glow (phase 114a bump) headroom to roll off
  // gracefully instead of clipping flat against the sky's mid-brights; both renderers
  // share the same mapping/exposure/colour space so the composited canvases match.
  bgRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  bgRenderer.toneMappingExposure = 1.15;
  bgRenderer.outputColorSpace = THREE.SRGBColorSpace;
  bgRenderer.domElement.setAttribute("data-scene-layer", "background");
  applyCanvasStyle(bgRenderer.domElement);
  container.appendChild(bgRenderer.domElement);
  const background: BackgroundLayer = createBackgroundLayer(mobile);

  // --- Orb renderer (transparent, composited over the background). Full quality
  // by default; phase 117b's power-saver toggle drops antialiasing (fixed at
  // construction — the whole reason `CosmicScene` remounts on a toggle flip).
  // Appended second so it stacks on top. ---
  const orbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: !initial.powerSaver });
  orbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  orbRenderer.toneMappingExposure = 1.15;
  orbRenderer.outputColorSpace = THREE.SRGBColorSpace;
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
    /** Scratch target for the mini-orb's LIVE world centre (for projection) —
     * `computeProjections` overwrites this every call via `getWorldPosition`
     * (phase 96: tracks the entry animation, not just the rest slot). The
     * constructor value below is just its allocation, immediately stale. */
    worldPos: THREE.Vector3;
    /** The per-state target it eases toward; defaults to `klid` until setSubsystems. */
    target: OrbTarget;
    present: boolean;
    /** Task B3 — the RAW subsystem state (not just the derived `target`), so
     * `tick` can tell `connectors` which indices are currently LIVE
     * (`bezi`/`hlaseni`/`ceka`) for the per-connector alpha pulse. Defaults to
     * `klid` until `setSubsystems` pushes a real feed. */
    state: SubsystemState;
    /** Phase 117b — a cheap `${color}:${state}` signature of the LAST pushed
     * target, so `setSubsystems` can tell a genuine status/colour change (which
     * must `wake()` a parked power-saver scene and let the mini ease to its new
     * target) from a no-op feed refresh (same array, unchanged values — must NOT
     * wake, or a periodic refetch would defeat the freeze). */
    stateKey: string;
  }
  /** Task B3 — `connectors.update`'s `liveFlags[i]` gate: a subsystem pulses
   * its connector only while genuinely LIVE, matching the mini-orb's own
   * livelier `MINI_BASE` targets (`bezi`/`hlaseni`/`ceka`) — `klid` (idle)
   * never pulses. */
  function isLiveState(state: SubsystemState): boolean {
    return state === "bezi" || state === "hlaseni" || state === "ceka";
  }
  // Task B2 (Velín-D retune) — the NODE ring is now a wider ELLIPSE
  // (NODE_RING_RADIUS_X horizontal, NODE_RING_RADIUS vertical, unchanged); the
  // hub ring (hubSlots below) and the orb-flight ring (orbFlightSlots) stay
  // regular octagons.
  const nodeSlots = ellipseSlots(NODE_RING_RADIUS_X, NODE_RING_RADIUS);
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
      state: "klid",
      stateKey: `${subsystem.color}:klid`,
    };
  });

  const hubVerts = hubSlots(HUB_RADIUS);
  // Phase 97 legibility pass — a SEPARATE, smaller-radius ring than the
  // connectors' own hub vertices, used only as a handoff flight's orb-side
  // endpoint (see ORB_FLIGHT_RADIUS's doc). Same angles as hubVerts/nodeSlots
  // (same spoke), so a flight still rides straight out along the visible
  // spoke direction.
  const orbFlightVerts = orbFlightSlots(ORB_FLIGHT_RADIUS);

  // --- Connectors (task B3, Velín-D retune): extracted from the retired
  // inline "net" (phase 95/101/107, which also drew a hub octagon + a small
  // octagon ringing each mini-orb) into `connectorsLayer.ts`. Velín-D's
  // reference design has no octagon rings — just the radiating center↔node
  // links — so only the connector segments survive the extraction; see that
  // module's doc for the full rationale (including the "live pulse" as a
  // vertex-color brightness wave rather than a real per-vertex alpha, since
  // this stays ONE additive `LineSegments` draw call). Positions are fixed
  // once built (the hub ring never moves; `setNodes` exists for a future
  // node-ring change) — only the per-frame pulse below animates.
  const connectors: ConnectorsLayer = createConnectorsLayer(hubVerts, nodeSlots);
  cluster.add(connectors.object3d);
  /** The entry ("mitosis") animation below fades/scales the connectors in
   * directly (the same way the retired net's `netMaterial`/`net.scale` were
   * driven) — `ConnectorsLayer`'s public surface has no `setOpacity`, so this
   * reaches through `object3d.material` (always the single `LineBasicMaterial`
   * {@link createConnectorsLayer} constructs) rather than inventing new API
   * surface for a one-off entry effect. */
  function connectorsMaterial(): THREE.LineBasicMaterial {
    return connectors.object3d.material as THREE.LineBasicMaterial;
  }

  // --- Handoff-flight particles (phase 97): a fixed pool of faint additive motes
  // riding the net's spokes — the restored Phase-89 dispatch/report animation, now
  // WebGL. Cluster-local space, same as the net/mini-orb slots above, so a flight
  // between a hub vertex and a mini-orb's live position never needs its own
  // coordinate conversion. ---
  const particles: ParticleLayer = createParticleLayer();
  cluster.add(particles.object3d);

  // --- Per-subsystem orbital task particles (task B4): a fixed pool of ambient
  // motes ringing each mini-orb, one per active run the subsystem currently owns
  // ("each light = one processing task"). Added directly to `orbScene` (a
  // SIBLING of `cluster`, not a child) because it's driven from each mini-orb's
  // WORLD position (`mini.worldPos`, refreshed every tick below) rather than
  // cluster-local coordinates — the same live position `computeProjections`
  // already tracks for the DOM overlay, reused verbatim so an orbiter never lags
  // a subsystem still mid-entry-animation. ---
  const orbitField: OrbitFieldLayer = createOrbitFieldLayer();
  orbScene.add(orbitField.object3d);
  /** Each subsystem id → its mini-orb's live WORLD-space centre — built ONCE
   * from the SAME `Vector3` instances the minis already own (`mini.worldPos`),
   * so this map's entries update in place every time `tick` refreshes
   * `mini.worldPos` below; never reallocated. */
  const orbitCenters = new Map<SubsystemId, THREE.Vector3>(minis.map((m) => [m.id, m.worldPos]));
  /** The last per-subsystem count actually applied via `setSubsystemLoad` — lets
   * a no-op feed refresh (same tally, new object reference) skip `wake()`,
   * mirroring `setSubsystems`' own no-op guard. */
  const lastAppliedLoad = new Map<SubsystemId, number>(SUBSYSTEMS.map((s) => [s.id, 0]));

  // --- Phase 96 entry ("mitosis") animation state. Reduced motion → skip the
  // clock entirely and leave everything at the rest state it was just built in
  // (mini-orbs at their slots, connectors at full opacity/scale, core at
  // ORB_SCALE). ---
  let entryActive = !initial.reducedMotion;
  let entryElapsed = 0;
  /** Collapse the mini-orbs into the central orb and hide the connectors — the
   * "before mitosis" state {@link entryActive}'s per-frame block then animates
   * out of. Shared by the initial setup (below) and `replayEntry`. */
  function collapseForEntry() {
    for (const mini of minis) {
      mini.layer.object3d.position.set(0, 0, 0);
      mini.layer.object3d.scale.setScalar(0);
    }
    connectorsMaterial().opacity = 0;
    connectors.object3d.scale.setScalar(NET_ENTRY_START_SCALE);
  }
  if (entryActive) {
    // Collapse right away so the very FIRST rendered frame already shows the
    // "before mitosis" state, not one frame of the phase-95 rest look followed
    // by a visible pop backward.
    collapseForEntry();
  }
  /**
   * Apply the entry animation's visual state for an EXACT elapsed time `t`
   * (mini-orb positions/scales, the connectors' fade/scale-in, the central-orb
   * impulse) — a pure function of `t` over the mutable three.js state, with no
   * side effect on `entryElapsed` itself. Returns whether every mini-orb has
   * reached progress 1 (i.e. the whole ripple is done at `t`). Shared by the
   * per-frame tick (which calls it with the accumulating `entryElapsed`) and
   * {@link SceneController.scrubEntry} (dev/testing — calls it with an
   * arbitrary `t` for a deterministic single-frame render).
   */
  function applyEntryAt(t: number): boolean {
    let allDone = true;
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i]!;
      const slot = nodeSlots[i]!;
      const p = mitosisProgress(t, i, minis.length, { easing: easeOutBack });
      if (p < 1) allDone = false;
      // lerp(origin=(0,0), slot, p) — origin is the cluster-local (0,0), so
      // this is literally `slot * p`; a p briefly > 1 (easeOutBack's
      // overshoot) reads as a slight overshoot-then-settle past the slot.
      mini.layer.object3d.position.set(slot.x * p, slot.y * p, 0);
      mini.layer.object3d.scale.setScalar(Math.max(MINI_ORB_WORLD_RADIUS * p, 0));
    }

    // The connectors fade/scale in over the second half of the entry window —
    // they never render to empty space while the mini-orbs are still near the
    // centre.
    const netStart = MITOSIS_TOTAL_DURATION * NET_FADE_START_FRACTION;
    const netLocal = (t - netStart) / (MITOSIS_TOTAL_DURATION - netStart);
    const netP = easeOutCubic(Math.min(Math.max(netLocal, 0), 1));
    connectorsMaterial().opacity = CONNECTORS_OPACITY * netP;
    connectors.object3d.scale.setScalar(NET_ENTRY_START_SCALE + (1 - NET_ENTRY_START_SCALE) * netP);

    // A brief, colour-neutral scale impulse on the central orb at t≈0 — decays
    // fast, well before the mini-orbs finish travelling.
    const impulse =
      t < ENTRY_IMPULSE_WINDOW ? ENTRY_IMPULSE_PEAK * Math.exp(-t * ENTRY_IMPULSE_DECAY_RATE) : 0;
    core.scale.setScalar(ORB_SCALE * (1 + impulse));

    return allDone;
  }
  /** Snap every entry-animated transform to its exact rest value and stop the
   * clock — called once, either naturally (all mini-orbs' progress reached 1)
   * or immediately if reduced motion is asserted mid-flight. Idempotent-safe:
   * once `entryActive` is false the frame loop never calls this again. */
  function finishEntry() {
    entryActive = false;
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i]!;
      const slot = nodeSlots[i]!;
      mini.layer.object3d.position.set(slot.x, slot.y, 0);
      mini.layer.object3d.scale.setScalar(MINI_ORB_WORLD_RADIUS);
    }
    connectorsMaterial().opacity = CONNECTORS_OPACITY;
    connectors.object3d.scale.setScalar(1);
    core.scale.setScalar(ORB_SCALE);
  }

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

  /**
   * Refresh every mini-orb's LIVE world position into its own `mini.worldPos`
   * (the cluster subtree matrix recompute + one `getWorldPosition` per mini) —
   * the single, once-per-frame traversal shared by BOTH the orbit field (task
   * B4, which reads `mini.worldPos` via `orbitCenters` pre-render) and
   * {@link computeProjections} (post-render). Task B4 split this out of
   * `computeProjections` so the heaviest new layer doesn't force a second
   * identical traversal every frame — call this ONCE per frame before render;
   * both readers then reuse the refreshed values (nothing moves the minis
   * between the pre-render orbit update and the post-render projection). Also
   * called standalone by `subscribeProjections`/`scrubEntry`, which need fresh
   * positions outside the tick loop.
   */
  function refreshMiniWorldPositions() {
    cluster.updateMatrixWorld();
    for (let i = 0; i < minis.length; i++) {
      // Phase 96: read the LIVE world position off the group itself (tracks the
      // mitosis entry animation frame-by-frame, not just the phase-95 static
      // rest slot). `mini.worldPos` is reused as the write target
      // (allocation-light) — at rest numerically identical to the rest slot.
      minis[i]!.layer.object3d.getWorldPosition(minis[i]!.worldPos);
    }
  }

  function computeProjections() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // The camera matrices must be current for `.project()` (drift moves the
    // camera every frame) — a cheap single-node update, kept here. The cluster
    // subtree traversal + per-mini world-position refresh is NOT redone here:
    // `mini.worldPos` was already refreshed once this frame by
    // `refreshMiniWorldPositions` (in `tick`, pre-render; or explicitly by
    // `subscribeProjections`/`scrubEntry` before they call this), so projection
    // only does the NDC→px math off those already-fresh positions.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    // The camera's world-space right axis (drift rotates it slightly) — offset the
    // edge sample along it so the on-screen radius is measured across the screen,
    // not along a fixed world axis.
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i]!;
      const proj = projections[i]!;
      const liveRadius = mini.layer.object3d.scale.x;
      projCenter.copy(mini.worldPos).project(camera);
      projEdge.copy(mini.worldPos).addScaledVector(cameraRight, liveRadius).project(camera);
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
    const bgDpr = Math.min(dpr, lowPower ? 1 : 1.5);
    bgRenderer.setPixelRatio(bgDpr);
    bgRenderer.setSize(w, h, false);
    background.setAspect(w / h);
    // Phase 117e — the sky pass renders into a half-resolution target sized off
    // this SAME effective dpr, so the render-target size composes with the DPR
    // cap above instead of duplicating/drifting from it.
    background.resize(w, h, bgDpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dock.measure();
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(container);
  resize();

  /** The full per-tick update+render body — extracted from `frame()` so
   * power-saver's ~30fps throttle (117b variant 4b) can run it at an accumulated
   * `dt` instead of the raw per-`requestAnimationFrame` delta, while the
   * non-power-saver path calls it every frame exactly as before. */
  function tick(dt: number) {
    elapsed += dt;
    // Phase 117b — burn down the post-target-change settle window (see
    // SETTLE_DURATION_S); only consulted by `isAtRest` on the power-saver path.
    settleTimer = Math.max(0, settleTimer - dt);

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

    // Task B3 — the connectors' per-connector alpha pulse: only a PRESENT,
    // genuinely LIVE subsystem's link pulses; everything else holds its
    // steady base tone (mirrors the retired net's always-on faint look).
    connectors.update(
      dt,
      minis.map((mini) => mini.present && isLiveState(mini.state)),
    );

    // Phase 97: advance every in-flight handoff particle (real events only — never
    // fed by the clock itself, only `emitFlight` ever calls `particles.emit`).
    particles.update(dt);

    // Phase 96: the one-shot mitosis entry — overrides each mini-orb GROUP's
    // position/scale (never its internal mesh, updated above) until every
    // index's staggered progress reaches 1, then hands back to the static rest
    // placement for good (see `finishEntry`, no re-trigger).
    if (entryActive) {
      if (inputs.reducedMotion) {
        // Reduced motion asserted mid-flight (rare) — snap to rest immediately,
        // honoring "no travel, no scale-in, no impulse" even if it changes
        // after the fork already started.
        finishEntry();
      } else {
        entryElapsed += dt;
        if (applyEntryAt(entryElapsed)) finishEntry();
      }
    }

    // Gentle camera parallax — disabled under reduced motion.
    if (!inputs.reducedMotion) {
      driftPhase += dt * 0.15;
      camera.position.x = Math.sin(driftPhase) * 0.18;
      camera.position.y = Math.cos(driftPhase * 0.8) * 0.12;
      camera.lookAt(0, 0, 0);
    }

    // Task B4 — the SINGLE per-frame mini world-position refresh, shared by the
    // orbit field (here, pre-render) and the projection push (post-render, via
    // `emitProjections`). Must run AFTER the entry animation above (which may
    // have just moved a mini-orb's LOCAL position this frame) and BEFORE
    // `orbRenderer.render`, so this frame's orbit-field buffer writes are the
    // ones actually drawn. `computeProjections` (post-render) reuses these same
    // `mini.worldPos` values rather than re-traversing — nothing moves the minis
    // between here and render.
    refreshMiniWorldPositions();
    orbitField.update(dt, orbitCenters, inputs.reducedMotion);

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

  /** Phase 117b — whether the scene has nothing left to animate: the one-shot
   * mitosis entry is done, the energy/flash envelopes have fully decayed, and no
   * handoff particle is mid-flight. The power-saver freeze (variant 5) parks the
   * loop once this goes true; factored as its own function so 117c's always-on
   * idle demand-render can reuse the same "is anything actually moving" check. */
  function isAtRest(): boolean {
    return (
      !entryActive && energy <= 0 && flash <= 0 && !particles.hasActive() && settleTimer <= 0
    );
  }

  /** Phase 117c — the shared "how hard should we throttle this tick" decision,
   * used by BOTH power-saver's always-on ~30fps cap (117b) and the always-on
   * idle demand-render's resting ~10fps cap (117c variant 1), so the two never
   * fight over one clock/accumulator. `frame()` calls this TWICE per tick: once
   * with the PRE-tick `atRest` to choose the interval this tick is gated
   * behind, and once with the POST-tick `atRest` to decide whether the loop may
   * stop scheduling entirely (`park`) — mirroring the two-phase shape 117b
   * already used inline before this was factored out.
   *
   * Power-saver throttles to ~30fps unconditionally (active or resting) and
   * parks the instant it's at rest — the harder, opt-in floor, unchanged from
   * 117b. Outside power-saver, the loop runs full rate whenever there's real
   * work to animate; once at rest, `reducedMotion` (which disables the
   * camera-parallax drift — nothing left to move) lets it park exactly like
   * power-saver, while a still-drifting camera can only be throttled to the
   * resting ~10fps cadence, never fully stopped — `park` is false in that case
   * even though `atRest` is true. */
  function restFrameBudget(params: {
    powerSaver: boolean;
    reducedMotion: boolean;
    atRest: boolean;
  }): { intervalS: number; park: boolean } {
    const { powerSaver, reducedMotion, atRest } = params;
    const park = atRest && (powerSaver || reducedMotion);
    if (powerSaver) return { intervalS: POWER_SAVER_FRAME_INTERVAL_S, park };
    if (atRest && !reducedMotion) return { intervalS: IDLE_FRAME_INTERVAL_S, park };
    return { intervalS: 0, park };
  }

  function frame() {
    if (!running) return;

    const dt = Math.min(clock.getDelta(), 0.05); // clamp after a tab-switch stall
    const preTick = restFrameBudget({
      powerSaver: inputs.powerSaver,
      reducedMotion: inputs.reducedMotion,
      atRest: isAtRest(),
    });

    if (preTick.intervalS <= 0) {
      // Full rate: schedule the next frame up front (so a thrown `tick` never
      // stalls the loop) and always render this tick. Reached whenever there's
      // real activity to animate, OR (117c) the single tick that confirms a
      // `reducedMotion` scene has settled at rest — that case parks right
      // below instead of throttling toward a cadence it will never use.
      rafId = requestAnimationFrame(frame);
      tick(dt);
    } else {
      // Throttled cadence — power-saver's always-on ~30fps floor (variant 4b),
      // or 117c's resting ~10fps while the camera drift is still live (variant
      // 1). Accumulate wall-clock time and only run the update+render body
      // once the interval elapses; nothing is (re)scheduled until the park
      // decision below.
      frameAccum += dt;
      if (frameAccum < preTick.intervalS) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      const stepDt = frameAccum;
      frameAccum = 0;
      tick(stepDt);
    }

    const postTick = restFrameBudget({
      powerSaver: inputs.powerSaver,
      reducedMotion: inputs.reducedMotion,
      atRest: isAtRest(),
    });
    if (postTick.park) {
      // Nothing left to animate under the active gate (power-saver, always; or
      // reducedMotion, whose camera never drifts) — stop scheduling frames
      // entirely (zero draws while resting). Cancels a frame the full-rate
      // branch above may already have pre-scheduled. `running = false` mirrors
      // `pause()`'s own bookkeeping so `wake()`'s `start()` call actually
      // restarts the loop instead of no-op'ing on a stale `running === true`.
      running = false;
      cancelAnimationFrame(rafId);
      return;
    }
    if (preTick.intervalS <= 0) return; // already (re)scheduled in the full-rate branch above
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    frameAccum = 0;
    clock.getDelta(); // drop the accumulated gap so the first dt is small
    rafId = requestAnimationFrame(frame);
  }

  /** Re-arm the loop after real activity (`pushActivity`/`flashComplete`/a mode
   * change/`emitFlight`/a subsystem status change) once it has parked at rest —
   * under power-saver (always parks at rest), or (117c) outside power-saver
   * when `reducedMotion` parked it too. A no-op when not parked (including the
   * 117c resting ~10fps cadence, which never parks — the loop is already
   * running, so `start()` below no-ops harmlessly), and — deliberately — when
   * the host has paused the scene (`pause()`, tab hidden): activity arriving in
   * a hidden tab must not start rendering; `resume()` is the only path back
   * from a host-pause.
   *
   * `settle: true` is passed by wakes that change an EASED target (a mode change
   * or a subsystem status/colour change) — it arms the {@link SETTLE_DURATION_S}
   * window so the transition finishes on screen before the loop can freeze again,
   * rather than parking after a single tick with the orb stuck partway. The
   * settle window is armed even while `hostPaused` (before the early-return) so a
   * change that landed while the tab was hidden still settles cleanly once
   * `resume()` restarts the loop. Activity-only wakes pass `false` — their own
   * energy/flash/particle signals already keep the scene non-resting. */
  function wake(settle = false) {
    if (settle) settleTimer = SETTLE_DURATION_S;
    if (disposed || hostPaused) return;
    start();
  }

  start();

  return {
    setInputs(next) {
      const modeChanged = next.mode !== inputs.mode;
      inputs = next;
      // The dock is a DOM overlay: `setItems` reconciles chips synchronously and
      // fades them via CSS transitions + its OWN internal rAF — the WebGL render
      // loop's `tick` never touches it, so a dock change while the scene is parked
      // under power-saver applies immediately and needs no `wake()`.
      dock.setItems(next.dock);
      // A mode change (e.g. `idle` → `listening`/`thinking`) is genuine activity
      // worth waking a parked power-saver scene for, and it changes the orb's
      // EASED target — `settle: true` so the transition completes on screen
      // instead of freezing after one tick.
      if (modeChanged) wake(true);
    },
    setSubsystems(list) {
      // Key by id so a severity-sorted or momentarily-short feed never reflows the
      // fixed octagon — each mini-orb reads its own entry (missing → not present).
      const byId = new Map(list.map((s) => [s.id, s]));
      let changed = false;
      for (const mini of minis) {
        const next = byId.get(mini.id);
        if (next) {
          const key = `${next.color}:${next.state}`;
          if (next.present !== mini.present || key !== mini.stateKey) changed = true;
          mini.present = next.present;
          mini.target = miniOrbTarget(next.color, next.state);
          mini.state = next.state;
          mini.stateKey = key;
        } else {
          if (mini.present) changed = true;
          mini.present = false;
        }
      }
      // A genuine status/colour change updates a mini-orb's EASED target, which
      // `tick` only advances while the loop runs — so under power-saver a subsystem
      // going red while the scene is parked would otherwise never ease in. Wake
      // (with the settle window) so the transition plays out. `changed` gates this
      // so a no-op feed refresh (same values, new array reference) can't defeat
      // the freeze by waking on every poll.
      if (changed) wake(true);
    },
    setSubsystemLoad(counts) {
      // Same "no-op refresh must not wake a parked scene" guard as
      // `setSubsystems` — a fresh feed refetch that resolves to the SAME tally
      // must not defeat the power-saver freeze; only a genuine change (a run
      // starting/finishing) wakes the loop, with the settle window so the
      // newly-appeared/removed orbiter actually gets a chance to ease in/out
      // on screen before the loop can re-park.
      let changed = false;
      for (const subsystem of SUBSYSTEMS) {
        const n = counts[subsystem.id] ?? 0;
        if (n !== lastAppliedLoad.get(subsystem.id)) changed = true;
        lastAppliedLoad.set(subsystem.id, n);
        orbitField.setCount(subsystem.id, n);
      }
      if (changed) wake(true);
    },
    subscribeProjections(cb) {
      projectionSubscribers.add(cb);
      // Fire once immediately so the overlay can place its nodes before the next
      // frame (and even while paused). Outside the tick loop, so refresh the
      // mini world positions first (the tick's own shared refresh hasn't run for
      // a brand-new subscriber — at mount the mini-orbs' matrixWorld is still the
      // construction-time identity).
      refreshMiniWorldPositions();
      computeProjections();
      cb(projections);
      return () => {
        projectionSubscribers.delete(cb);
      };
    },
    pushActivity(chars) {
      energy = Math.min(1, energy + Math.max(1, chars) * ENERGY_PER_CHAR);
      wake();
    },
    flashComplete() {
      flash = 1;
      wake();
    },
    emitFlight(from, to, color) {
      // `flightForEvent` guarantees exactly one side is "orb"; the other names the
      // owning subsystem. Both being "orb" (malformed input) has nothing to draw.
      const subsystemId = from === "orb" ? to : from;
      if (subsystemId === "orb") return;
      const index = REGISTRY_ORDER.indexOf(subsystemId);
      const orbPoint = orbFlightVerts[index];
      const mini = minis.find((m) => m.id === subsystemId);
      if (!orbPoint || !mini) return; // unknown/unregistered id — nothing to draw
      // A real dispatch/report flight is genuine activity — wake a parked scene
      // so the mote is actually drawn instead of animating invisibly behind a
      // stopped loop (not explicitly called out in the plan's wake-trigger list,
      // but required for the animation to be visible under power-saver).
      wake();
      const { from: fromPoint, to: toPoint } = resolveFlightEndpoints(
        from,
        to,
        orbPoint,
        mini.layer.object3d.position,
      );
      flightSeq += 1;
      const seed = `${from}:${to}:${color}:${flightSeq}`;
      if (inputs.reducedMotion) {
        // No travel — a brief static glow held at the DESTINATION only.
        const dest = new THREE.Vector3(toPoint.x, toPoint.y, 0);
        particles.emit(dest, dest, color, REDUCED_MOTION_GLOW_DURATION_S);
        return;
      }
      particles.emit(
        new THREE.Vector3(fromPoint.x, fromPoint.y, 0),
        new THREE.Vector3(toPoint.x, toPoint.y, 0),
        color,
        particleDuration(seed),
      );
    },
    pause() {
      // Set unconditionally (even if already parked at rest under power-saver)
      // so a subsequent `pushActivity`/`flashComplete`/mode-change arriving
      // while hidden can't `wake()` the loop — only `resume()` clears this.
      hostPaused = true;
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    },
    resume() {
      hostPaused = false;
      // A subsystem/mode change may have landed while the tab was hidden (its
      // `wake()` was suppressed by `hostPaused`, though it did arm the settle
      // window). Arm settle again here too so, regardless, the first frames after
      // resuming let any pending eased transition complete before the loop can
      // re-freeze under power-saver.
      settleTimer = SETTLE_DURATION_S;
      start();
    },
    replayEntry() {
      if (inputs.reducedMotion) return; // nothing to replay — no-motion contract
      collapseForEntry();
      entryElapsed = 0;
      entryActive = true;
    },
    scrubEntry(t) {
      if (inputs.reducedMotion) return; // nothing to scrub — no-motion contract
      running = false;
      cancelAnimationFrame(rafId);
      entryActive = true;
      entryElapsed = Math.max(t, 0);
      applyEntryAt(entryElapsed);
      // `applyEntryAt` just moved the mini-orbs' LOCAL positions — refresh their
      // world positions before projecting (this is outside the tick loop, so the
      // tick's own shared refresh won't run for this one-shot scrub frame).
      refreshMiniWorldPositions();
      orbRenderer.render(orbScene, camera);
      emitProjections();
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
      connectors.dispose();
      particles.dispose();
      orbitField.dispose();
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
