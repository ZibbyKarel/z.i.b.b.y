"use client";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ConnectorLayer, type ConnectorNode } from "../ConnectorLayer/ConnectorLayer";
import { CoreOrb } from "../CoreOrb/CoreOrb";
import { type EllipseInsets, type OrbPosition, ellipseLayout } from "../ellipseLayout";
import { HandoffFlare } from "../HandoffFlare/HandoffFlare";
import { ensureImmersiveCss } from "../immersive.css";
import { OrbNode } from "../OrbNode/OrbNode";
import { ORB_STATE, type OrbState } from "../orbState";
import { useMeasure } from "../useMeasure";

export enum OrbMapTestId {
  Root = "orb-map-root",
  Layer = "orb-map-layer",
  Core = "orb-map-core",
  Node = "orb-map-node",
}

export interface OrbMapNode {
  /** Stable key (e.g. the subsystem id in the app). */
  id: string;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — drives motion, chrome color, and connector liveness. */
  state: OrbState;
  /** Name shown under the orb. */
  label: string;
  /** Localized status text shown under the name (e.g. "working"). */
  statusLabel: string;
  /** A DS `<Icon/>` instance rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the orbit-field dot count. */
  activeCount: number;
}

export interface OrbMapCore {
  /** Identity color for the core orb body, heartbeat rings, and glow. */
  hex: string;
  /** Orbit-field dot count (the app uses a fixed 4, but this is generic). */
  activeCount: number;
  /** Baseline heartbeat cadence driver, roughly a 0..0.7 domain. */
  intensity: number;
  /** Streaming/response flag — pulses the core when true. */
  thinking: boolean;
}

export interface OrbMapFlare {
  /** Unique id — the caller drops the flare from `flares` once it retires. */
  id: string;
  /** A node's `id`, or the reserved {@link ORB_MAP_CORE_ID} for the central core. */
  fromId: string;
  /** A node's `id`, or the reserved {@link ORB_MAP_CORE_ID} for the central core. */
  toId: string;
  color?: string;
}

/**
 * Reserved `fromId`/`toId` value meaning "the central core orb" — lets a flare
 * represent a dispatch (`core → node`) or a report (`node → core`), not just a
 * node-to-node handoff. No real node may use this id (the app's node ids come
 * from a fixed registry that never collides with it).
 */
export const ORB_MAP_CORE_ID = "core";

export interface OrbMapProps {
  nodes: OrbMapNode[];
  core: OrbMapCore;
  /** Layout reserves (tasks panel, dock, chat bar) — merged over an all-zero default. */
  insets?: Partial<EllipseInsets>;
  /** Active hand-off comets — driven by real hand-off events from the app. */
  flares?: OrbMapFlare[];
  onSelectNode?: (id: string) => void;
  onSelectCore?: () => void;
  /** Called with a flare's `id` once its lifetime ends, so the caller can drop it from `flares`. */
  onFlareDone?: (id: string) => void;
  ref?: React.Ref<HTMLDivElement>;
}

const DEFAULT_INSETS: EllipseInsets = { top: 0, left: 0, right: 0, bottom: 0 };

/**
 * Composes the immersive orb map: measures its container, computes the responsive
 * ellipse layout, and renders the {@link ConnectorLayer} beneath a centered
 * {@link CoreOrb} and one {@link OrbNode} per entry in `nodes` — plus any active
 * {@link HandoffFlare}s between node pairs (or a node and the core, via the
 * reserved {@link ORB_MAP_CORE_ID} endpoint). Sizing-API exception (documented at
 * the bundle level): all computed geometry (positions, ellipse radii, core/node
 * diameters) is inline-styled — DS is exempt from `react/forbid-dom-props`. No
 * per-frame allocation here (children own their own rAF loops).
 *
 * Ported from `VcMapD` (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`), minus its demo
 * hand-off timer — `flares` is a controlled prop the app drives from real events.
 */
export function OrbMap({
  nodes,
  core,
  insets,
  flares = [],
  onSelectNode,
  onSelectCore,
  onFlareDone,
  ref,
}: OrbMapProps) {
  useEffect(() => {
    ensureImmersiveCss();
  }, []);

  const [measureRef, { w, h }] = useMeasure();
  const merged: EllipseInsets = { ...DEFAULT_INSETS, ...insets };
  const layout = ellipseLayout(w, h, nodes.length, merged);

  const posById = new Map<string, OrbPosition>();
  posById.set(ORB_MAP_CORE_ID, { x: layout.cx, y: layout.cy });
  nodes.forEach((n, i) => {
    const p = layout.positions[i];
    if (p) posById.set(n.id, p);
  });

  const connectorNodes: ConnectorNode[] = nodes.map((n, i) => {
    const p = layout.positions[i] ?? { x: layout.cx, y: layout.cy };
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      color: ORB_STATE[n.state].color,
      live: ORB_STATE[n.state].live,
    };
  });

  return (
    <div data-testid={OrbMapTestId.Root} ref={ref} style={{ position: "absolute", inset: 0 }}>
      <div
        data-testid={OrbMapTestId.Layer}
        ref={measureRef}
        style={{ position: "absolute", inset: 0 }}
      >
        <ConnectorLayer center={{ x: layout.cx, y: layout.cy }} nodes={connectorNodes} />
        <div
          style={{
            position: "absolute",
            left: layout.cx,
            top: layout.cy,
            transform: "translate(-50%,-50%)",
            zIndex: 2,
          }}
        >
          <div data-testid={OrbMapTestId.Core}>
            <CoreOrb
              activeCount={core.activeCount}
              hex={core.hex}
              intensity={core.intensity}
              onClick={onSelectCore}
              size={layout.coreSize}
              thinking={core.thinking}
            />
          </div>
        </div>
        {nodes.map((n, i) => {
          const p = layout.positions[i] ?? { x: layout.cx, y: layout.cy };
          return (
            <div
              data-testid={`${OrbMapTestId.Node}-${n.id}`}
              key={n.id}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: "translate(-50%,-50%)",
                zIndex: 2,
              }}
            >
              <OrbNode
                activeCount={n.activeCount}
                diameter={layout.nodeD}
                hex={n.hex}
                icon={n.icon}
                label={n.label}
                nodeId={n.id}
                onClick={() => onSelectNode?.(n.id)}
                state={n.state}
              />
            </div>
          );
        })}
        {/* The caller prunes finished flares via `onFlareDone`; without it, entries persist
            (harmless static end-state, but prune for long-lived maps). */}
        {flares.map((f) => {
          const from = posById.get(f.fromId);
          const to = posById.get(f.toId);
          if (!from || !to) return null;
          return (
            <HandoffFlare
              color={f.color}
              from={from}
              key={f.id}
              onDone={() => onFlareDone?.(f.id)}
              to={to}
            />
          );
        })}
      </div>
    </div>
  );
}
