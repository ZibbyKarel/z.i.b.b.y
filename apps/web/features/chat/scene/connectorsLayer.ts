import * as THREE from "three";
import { type ClusterSlot, NODE_OCTAGON_RADIUS, pointToward } from "./clusterGeometry";
import { resolveForegroundFaintHex } from "./tokens";

/**
 * Task B3 (Velín-D retune) — the center→subsystem "connectors", extracted from
 * the inline WebGL "net" that used to live directly in `sceneController.ts`
 * (phase 95/101/107). The retired net baked THREE things into one buffer: the
 * hub octagon's edges, a small octagon ringing each mini-orb, and a hub→node
 * connector segment. Velín-D's reference design (`VcConnectors`, quadratic
 * center↔node paths with a dashed live-pulse) has no octagon rings at all —
 * just the radiating links — so this layer keeps ONLY the connector segments;
 * the octagon geometry is retired along with it (the mini-orb's own glow now
 * carries the "ringed node" read).
 *
 * WebGL has no CSS `stroke-dasharray`/`stroke-dashoffset`, so the "dashed pulse
 * when live" is reinterpreted as a per-connector ALPHA wave: since the whole
 * layer is one additively-blended `LineSegments` (a single draw call — no
 * per-connector materials/groups), true per-vertex alpha would need a
 * `ShaderMaterial`. Instead this modulates each connector's vertex COLOR
 * brightness over time via `vertexColors` on a plain `LineBasicMaterial` —
 * under `AdditiveBlending` over the dark scene, scaling a vertex's brightness
 * reads visually identical to scaling its alpha, at a fraction of the
 * complexity (no GLSL, no uniform wiring) for a layer this small (8
 * connectors × 4 vertices). Only LIVE subsystems (`bezi`/`hlaseni`/`ceka`)
 * pulse; everything else holds its steady base tone, exactly like the retired
 * net's always-on faint wiring look.
 *
 * Geometry is built ONCE (`buildPositions`) from the hub/node slots handed to
 * the factory (or a later `setNodes` call) — per the brief, positions are
 * static once nodes are set; only the color/alpha wave animates per frame.
 */

export interface ConnectorsLayer {
  object3d: THREE.LineSegments;
  /** Rebuild the connector endpoints from a new node-ring layout. Hub slots are
   * fixed for the layer's lifetime (the inner ring never moves) — only the
   * outer node slots are ever expected to change. */
  setNodes(slots: ClusterSlot[]): void;
  /** @param liveFlags per-connector (registry-index-ordered) whether that
   * subsystem is currently LIVE (`bezi`/`hlaseni`/`ceka`) — only those indices
   * get the alpha-pulse wave this frame; a shorter/missing entry reads as
   * `false` (not live). */
  update(dt: number, liveFlags: readonly boolean[]): void;
  dispose(): void;
}

/** The connector net's rest opacity — the exact same value the retired net's
 * `NET_OPACITY` held, so the mitosis entry fade-in (owned by
 * `sceneController.ts`, which reads this constant directly) still settles at
 * the identical "crisp but faint" look. Single source so the entry animation
 * and this layer's own material construction can never drift apart. */
export const CONNECTORS_OPACITY = 0.6;

/** Line segments drawn per connector: `hub → bend → nodeNear`, a 2-segment
 * poly-line that reads as a subtle bow instead of a dead-straight spoke — the
 * cheapest WebGL stand-in for the retired SVG's quadratic-bezier path.
 * Exported so the geometry test can assert the exact vertex count without
 * duplicating the constant. */
export const SEGMENTS_PER_CONNECTOR = 2;

/** How far (world units) the connector's midpoint bows off the straight
 * hub→node line — deliberately small; this is a whisper of curvature, not a
 * loop. */
const BEND_AMOUNT = 0.05;

/** Peak fractional brightness swing for a LIVE connector's alpha-pulse wave
 * (see the module doc's vertex-color-as-alpha rationale) — kept modest so a
 * live subsystem's connector reads as a gentle shimmer, never a strobe. */
const PULSE_AMPLITUDE = 0.35;
/** Angular speed (rad/s) of that pulse. */
const PULSE_SPEED = 2.0;
/** Per-connector phase stagger (rad) so 8 simultaneously-live connectors don't
 * pulse in lockstep — a small deterministic offset per registry index. */
const PULSE_STAGGER = 0.6;

/**
 * The 3 points of one connector's 2-segment poly-line: the hub vertex, a
 * subtly-bowed midpoint, and the node-side endpoint pulled IN from the node's
 * centre by {@link NODE_OCTAGON_RADIUS} (the same convention the retired net
 * used for its own connector stub) so the line never visually pierces the
 * mini-orb. The bow reuses {@link pointToward} a second time — walking from
 * the straight midpoint toward an (arbitrary, far) point along the
 * hub→node segment's perpendicular by {@link BEND_AMOUNT} — rather than a real
 * quadratic-bezier tessellation, since a single extra vertex already reads as
 * a bend at this line width/scale.
 */
function connectorPoints(
  hub: ClusterSlot,
  node: ClusterSlot,
): [ClusterSlot, { x: number; y: number }, { x: number; y: number }] {
  const near = pointToward(node, hub, NODE_OCTAGON_RADIUS);
  const mid = { x: (hub.x + near.x) / 2, y: (hub.y + near.y) / 2 };
  const dx = near.x - hub.x;
  const dy = near.y - hub.y;
  // A point offset from `mid` along the perpendicular of hub→near — passing it
  // as pointToward's `to` argument makes pointToward normalize (dx,dy)'s
  // 90°-rotated direction for us, so `bend` lands exactly BEND_AMOUNT off the
  // straight line, on a consistent (always-CCW) side for every connector.
  const perp = { x: mid.x - dy, y: mid.y + dx };
  const bend = pointToward(mid, perp, BEND_AMOUNT);
  return [hub, bend, near];
}

/** Flat `[x, y, z, ...]` position buffer for every connector's 2-segment
 * poly-line, in `LineSegments` order (each consecutive pair of vertices is one
 * drawn segment): `[hub, bend, bend, near]` per connector. */
function buildPositions(hub: ClusterSlot[], nodes: ClusterSlot[]): Float32Array {
  const vertsPerConnector = SEGMENTS_PER_CONNECTOR * 2;
  const positions = new Float32Array(hub.length * vertsPerConnector * 3);
  let o = 0;
  for (let i = 0; i < hub.length; i++) {
    const [a, b, c] = connectorPoints(hub[i]!, nodes[i]!);
    positions[o++] = a.x;
    positions[o++] = a.y;
    positions[o++] = 0;
    positions[o++] = b.x;
    positions[o++] = b.y;
    positions[o++] = 0;
    positions[o++] = b.x;
    positions[o++] = b.y;
    positions[o++] = 0;
    positions[o++] = c.x;
    positions[o++] = c.y;
    positions[o++] = 0;
  }
  return positions;
}

/** Write every connector's vertex-color brightness for the given `elapsed`
 * clock + `liveFlags` — shared by construction (elapsed 0, all-false) and
 * every `update()` call so the two never drift out of sync. */
function paintColors(
  array: Float32Array,
  connectorCount: number,
  baseColor: THREE.Color,
  elapsed: number,
  liveFlags: readonly boolean[],
): void {
  const vertsPerConnector = SEGMENTS_PER_CONNECTOR * 2;
  for (let i = 0; i < connectorCount; i++) {
    const live = liveFlags[i] ?? false;
    const brightness = live
      ? 1 + PULSE_AMPLITUDE * Math.sin(elapsed * PULSE_SPEED + i * PULSE_STAGGER)
      : 1;
    const base = i * vertsPerConnector * 3;
    for (let v = 0; v < vertsPerConnector; v++) {
      const o = base + v * 3;
      array[o] = baseColor.r * brightness;
      array[o + 1] = baseColor.g * brightness;
      array[o + 2] = baseColor.b * brightness;
    }
  }
}

export function createConnectorsLayer(hub: ClusterSlot[], nodes: ClusterSlot[]): ConnectorsLayer {
  let currentNodes = nodes;
  let elapsed = 0;
  const baseColor = new THREE.Color(resolveForegroundFaintHex());

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buildPositions(hub, currentNodes), 3));
  const initialColors = new Float32Array(hub.length * SEGMENTS_PER_CONNECTOR * 2 * 3);
  paintColors(initialColors, hub.length, baseColor, 0, []);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(initialColors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: CONNECTORS_OPACITY,
    depthWrite: false,
    // Additive, same as the retired net — a clean glow over the dark nebula
    // rather than a flat opaque line.
    blending: THREE.AdditiveBlending,
  });

  const object3d = new THREE.LineSegments(geometry, material);

  return {
    object3d,
    setNodes(slots) {
      currentNodes = slots;
      const position = geometry.getAttribute("position") as THREE.BufferAttribute;
      const next = buildPositions(hub, currentNodes);
      (position.array as Float32Array).set(next);
      position.needsUpdate = true;
    },
    update(dt, liveFlags) {
      elapsed += dt;
      const color = geometry.getAttribute("color") as THREE.BufferAttribute;
      paintColors(color.array as Float32Array, hub.length, baseColor, elapsed, liveFlags);
      color.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
