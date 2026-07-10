import { SUBSYSTEMS, type SubsystemId } from "@zibby/contracts";
import * as THREE from "three";
import { particleDuration } from "../../subsystems/components/SubsystemWeb/particle-mapping";
import { type BackgroundLayer, createBackgroundLayer } from "./backgroundLayer";
import {
  HUB_RADIUS,
  MINI_ORB_WORLD_RADIUS,
  MITOSIS_TOTAL_DURATION,
  NODE_OCTAGON_RADIUS,
  NODE_RING_RADIUS,
  REGISTRY_ORDER,
  easeOutBack,
  easeOutCubic,
  hubSlots,
  mitosisProgress,
  octagonSlots,
  octagonSlotsAround,
  orbFlightSlots,
  pointToward,
  resolveFlightEndpoints,
} from "./clusterGeometry";
import { type DockLayer, createDockLayer } from "./dockLayer";
import { type OrbTarget, miniOrbTarget, orbTarget } from "./modeVisuals";
import { type OrbLayer, createOrbLayer } from "./orbLayer";
import { type ParticleLayer, createParticleLayer } from "./particleLayer";
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
 *  - `NODE_RING_RADIUS` — the octagon the 8 mini-orbs sit on (forge at the
 *    bottom). Well OUTSIDE the hub, so the spokes are long and radial. Phase 107
 *    pushed this from 0.85 to 1.05 to clear `HUB_RADIUS` plus a deliberate
 *    connector gap ({@link NODE_LINK_GAP} in `clusterGeometry.ts`) — see the
 *    no-overlap invariant on the net block below.
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
// their NODE_RING_RADIUS octagon slot while growing from scale 0 to
// MINI_ORB_WORLD_RADIUS, staggered per index (see clusterGeometry's
// mitosisProgress). Purely additive on top of the phase-95 rest state: once
// every mini-orb's progress reaches 1, everything below snaps to its exact rest
// value and is never touched again (no re-trigger).
/** The net's rest opacity (phase 95's `netMaterial` value) — single source so
 * the entry fade-in and its final snap-back can never drift from the rest look. */
const NET_OPACITY = 0.6;
/** The net starts this fraction of its final scale (a gentle scale-in, not a
 * pop) at the moment it begins to fade in. */
const NET_ENTRY_START_SCALE = 0.85;
/** The net stays fully invisible for the first half of the entry animation,
 * then fades/scales in over the second half — it must never draw to empty
 * space while the mini-orbs are still bunched near the centre. */
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
 * FOV/distance (see {@link glowCenterFromClusterY}). Paired with the COMPACT octagon
 * ({@link NODE_RING_RADIUS}, pushed from 0.85 to 1.05 in phase 107 to clear the hub
 * octagon plus a connector gap — see `clusterGeometry.ts`'s `NET_GEOMETRY`), so the
 * whole cluster (all 8 mini-orbs + their labels) sits in the upper region and the
 * lower half+ of the page stays clear for the transcript — no chat bubble ever
 * overlaps a mini-orb, and the top mini-orb (Beacon) clears the top bar. Phase 107
 * widened the ring, which nudges every mini-orb slightly closer to the viewport
 * edge than phase 94/98's tuning assumed — verify with a screenshot that nothing
 * clips (mini-orb, its octagon, or its label) before calling the tune final; if it
 * does, prefer trimming `NODE_LINK_GAP` first, then `NODE_RING_RADIUS` itself.
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

  // --- Orb renderer (transparent, composited over the background). Full quality,
  // always. Appended second so it stacks on top. ---
  const orbRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
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

  // --- WebGL net (phase 95, reworked phase 101, separated phase 107): the
  // inner octagon (hub→hub, ringing the orb) + a small octagon ringing EACH
  // mini-orb + a real CONNECTOR line between the two rings' facing vertices
  // (not a spoke piercing the mini-orb's centre). One additive faint
  // LineSegments in the shared foreground-faint tone — the same neutral
  // "wiring" colour the retired SVG web used. Nothing in it ever overlaps the
  // central orb: the innermost points are the hub vertices (HUB_RADIUS), which
  // clear the orb's glow with a gap.
  //
  // Phase 107 no-overlap invariant (see clusterGeometry.ts's `NET_GEOMETRY`,
  // asserted in clusterGeometry.test.ts against these SAME imported values):
  //   NODE_RING_RADIUS − NODE_OCTAGON_RADIUS > HUB_RADIUS
  // i.e. every node octagon's near point sits strictly OUTSIDE the hub
  // octagon, separated by roughly NODE_LINK_GAP of daylight — the two
  // octagons never touch by construction, and the connector below is always a
  // positive-length outward segment bridging that gap (never a reversed
  // inward stub). ---
  const hubVerts = hubSlots(HUB_RADIUS);
  // Phase 97 legibility pass — a SEPARATE, smaller-radius ring than the net's own
  // hub vertices, used only as a handoff flight's orb-side endpoint (see
  // ORB_FLIGHT_RADIUS's doc). Same angles as hubVerts/nodeSlots (same spoke), so
  // a flight still rides straight out along the visible spoke direction.
  const orbFlightVerts = orbFlightSlots(ORB_FLIGHT_RADIUS);
  const netPositions: number[] = [];
  for (let i = 0; i < hubVerts.length; i++) {
    const hub = hubVerts[i]!;
    const nextHub = hubVerts[(i + 1) % hubVerts.length]!;
    const node = nodeSlots[i]!;
    // Inner octagon edge (hub → next hub).
    netPositions.push(hub.x, hub.y, 0, nextHub.x, nextHub.y, 0);
    // Phase 101: the mini-orb's own small octagon, baked into the SAME buffer so
    // it inherits the net's entry fade/scale for free (no separate object).
    const nodeOctagon = octagonSlotsAround(node, NODE_OCTAGON_RADIUS);
    for (let v = 0; v < nodeOctagon.length; v++) {
      const a = nodeOctagon[v]!;
      const b = nodeOctagon[(v + 1) % nodeOctagon.length]!;
      netPositions.push(a.x, a.y, 0, b.x, b.y, 0);
    }
    // Connector (hub octagon's outer vertex, already pointing straight at the
    // node by construction — hub/node/origin are colinear — → the node octagon's
    // near vertex, walked IN from the node's centre toward the hub by the node
    // octagon's own radius). Replaces the old hub→node.center spoke that pierced
    // the mini-orb. Since phase 107's no-overlap invariant guarantees
    // nodeNear sits strictly outside the hub octagon, this is now a genuine
    // positive-length OUTWARD segment bridging the NODE_LINK_GAP daylight
    // between the two octagons — not a reversed inward stub.
    const nodeNear = pointToward(node, hub, NODE_OCTAGON_RADIUS);
    netPositions.push(hub.x, hub.y, 0, nodeNear.x, nodeNear.y, 0);
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
    opacity: NET_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const net = new THREE.LineSegments(netGeometry, netMaterial);
  cluster.add(net);

  // --- Handoff-flight particles (phase 97): a fixed pool of faint additive motes
  // riding the net's spokes — the restored Phase-89 dispatch/report animation, now
  // WebGL. Cluster-local space, same as the net/mini-orb slots above, so a flight
  // between a hub vertex and a mini-orb's live position never needs its own
  // coordinate conversion. ---
  const particles: ParticleLayer = createParticleLayer();
  cluster.add(particles.object3d);

  // --- Phase 96 entry ("mitosis") animation state. Reduced motion → skip the
  // clock entirely and leave everything at the rest state it was just built in
  // (mini-orbs at their slots, net at full opacity/scale, core at ORB_SCALE). ---
  let entryActive = !initial.reducedMotion;
  let entryElapsed = 0;
  /** Collapse the mini-orbs into the central orb and hide the net — the
   * "before mitosis" state {@link entryActive}'s per-frame block then animates
   * out of. Shared by the initial setup (below) and `replayEntry`. */
  function collapseForEntry() {
    for (const mini of minis) {
      mini.layer.object3d.position.set(0, 0, 0);
      mini.layer.object3d.scale.setScalar(0);
    }
    netMaterial.opacity = 0;
    net.scale.setScalar(NET_ENTRY_START_SCALE);
  }
  if (entryActive) {
    // Collapse right away so the very FIRST rendered frame already shows the
    // "before mitosis" state, not one frame of the phase-95 rest look followed
    // by a visible pop backward.
    collapseForEntry();
  }
  /**
   * Apply the entry animation's visual state for an EXACT elapsed time `t`
   * (mini-orb positions/scales, the net's fade/scale-in, the central-orb
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

    // The net fades/scales in over the second half of the entry window — it
    // never renders to empty space while the mini-orbs are still near the
    // centre.
    const netStart = MITOSIS_TOTAL_DURATION * NET_FADE_START_FRACTION;
    const netLocal = (t - netStart) / (MITOSIS_TOTAL_DURATION - netStart);
    const netP = easeOutCubic(Math.min(Math.max(netLocal, 0), 1));
    netMaterial.opacity = NET_OPACITY * netP;
    net.scale.setScalar(NET_ENTRY_START_SCALE + (1 - NET_ENTRY_START_SCALE) * netP);

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
    netMaterial.opacity = NET_OPACITY;
    net.scale.setScalar(1);
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

  function computeProjections() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // Ensure the camera AND the cluster's matrices are current regardless of
    // call order relative to render (drift moves the camera every frame, and
    // the phase-96 entry animation moves the mini-orbs) — cheap: the orb scene
    // graph is small, and `subscribeProjections` also fires this before the
    // very first render (mount), where the mini-orbs' matrixWorld would
    // otherwise still be the identity from construction.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    cluster.updateMatrixWorld();
    // The camera's world-space right axis (drift rotates it slightly) — offset the
    // edge sample along it so the on-screen radius is measured across the screen,
    // not along a fixed world axis.
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (let i = 0; i < minis.length; i++) {
      const mini = minis[i]!;
      const proj = projections[i]!;
      // Phase 96: read the LIVE world position + radius off the group itself
      // (rather than a stale value cached at rest) so the DOM overlay's
      // hit-target/label/badge track the mitosis entry animation frame-by-frame,
      // not just the phase-95 static rest slot. `mini.worldPos` is reused as the
      // write target (allocation-light) — at rest this is numerically identical
      // to the old cached value, so nothing changes once the entry settles.
      mini.layer.object3d.getWorldPosition(mini.worldPos);
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
    emitFlight(from, to, color) {
      // `flightForEvent` guarantees exactly one side is "orb"; the other names the
      // owning subsystem. Both being "orb" (malformed input) has nothing to draw.
      const subsystemId = from === "orb" ? to : from;
      if (subsystemId === "orb") return;
      const index = REGISTRY_ORDER.indexOf(subsystemId);
      const orbPoint = orbFlightVerts[index];
      const mini = minis.find((m) => m.id === subsystemId);
      if (!orbPoint || !mini) return; // unknown/unregistered id — nothing to draw
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
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    },
    resume() {
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
      netGeometry.dispose();
      netMaterial.dispose();
      particles.dispose();
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
