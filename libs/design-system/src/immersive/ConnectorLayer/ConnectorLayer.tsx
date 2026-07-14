import { useEffect } from "react";
import { ensureImmersiveCss } from "../immersive.css";

export enum ConnectorLayerTestId {
  Root = "connector-layer-root",
  Connector = "connector-layer-connector",
}

export interface ConnectorNode {
  id: string;
  x: number;
  y: number;
  color: string;
  live: boolean;
}

export interface ConnectorLayerProps {
  /** Origin the connectors radiate from (the core orb's centre). */
  center: { x: number; y: number };
  /** One connector is drawn per node, from `center` to `{ x, y }`. */
  nodes: ConnectorNode[];
}

/**
 * Full-bleed SVG layer drawing one quadratic-bezier connector from `center` to each
 * node. A faint base stroke is always drawn; a colour-matched dashed overlay animates
 * (`imDash`) on top when the node is `live`. Ported from the orb-map prototype's
 * `VcConnectors`. Purely decorative — ignores pointer events and is hidden from
 * assistive tech, since the nodes it connects carry their own accessible names.
 */
export function ConnectorLayer({ center, nodes }: ConnectorLayerProps) {
  useEffect(() => {
    ensureImmersiveCss();
  }, []);

  const { x: cx, y: cy } = center;

  return (
    <svg
      aria-hidden="true"
      data-testid={ConnectorLayerTestId.Root}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {nodes.map((n) => {
        const mx = (cx + n.x) / 2 + (n.y - cy) * 0.08;
        const my = (cy + n.y) / 2 - (n.x - cx) * 0.08;
        const d = `M ${cx} ${cy} Q ${mx} ${my} ${n.x} ${n.y}`;
        return (
          <g data-testid={`${ConnectorLayerTestId.Connector}-${n.id}`} key={n.id}>
            <path d={d} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
            {n.live && (
              <path
                d={d}
                fill="none"
                stroke={n.color}
                strokeDasharray="2 10"
                strokeLinecap="round"
                strokeOpacity="0.5"
                strokeWidth="1.4"
                style={{ animation: "imDash 3.2s linear infinite" }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
