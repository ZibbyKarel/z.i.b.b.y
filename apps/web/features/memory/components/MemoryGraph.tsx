"use client";

import { useMemo } from "react";
import type { MemoryGraph as Graph } from "@zibby/contracts";

export interface MemoryGraphProps {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Tone per tier (data-viz colours; the app's only non-DS surface is this canvas). */
const TIER_FILL: Record<Graph["nodes"][number]["tier"], string> = {
  memory: "var(--color-accent, #6ea8fe)",
  daily: "var(--color-ok, #4ade80)",
  knowledge: "var(--color-warn, #fbbf24)",
};

const WIDTH = 560;
const HEIGHT = 420;

interface Pos {
  id: string;
  x: number;
  y: number;
}

/**
 * A dependency-free force-directed graph: a short spring/charge simulation is run
 * deterministically (seeded by node index) in a memo, then drawn as SVG. Nodes are
 * clickable; the layout is stable for a given graph so it doesn't jitter on
 * re-render. Kept as a domain composite — the DS has no graph primitive.
 */
export function MemoryGraph({ graph, selectedId, onSelect }: MemoryGraphProps) {
  const positions = useMemo(() => simulate(graph), [graph]);
  const byId = new Map(positions.map((p) => [p.id, p]));

  return (
    <svg
      aria-label="Memory graph"
      data-testid="memory-graph"
      height={HEIGHT}
      role="img"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
    >
      {graph.edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        return (
          <line
            key={`${e.from}-${e.to}-${i}`}
            stroke="var(--color-border, #ffffff22)"
            strokeWidth={1}
            x1={a.x}
            x2={b.x}
            y1={a.y}
            y2={b.y}
          />
        );
      })}
      {graph.nodes.map((n) => {
        const p = byId.get(n.id);
        if (!p) return null;
        const selected = n.id === selectedId;
        return (
          <g
            data-testid={`memory-node-${n.id}`}
            key={n.id}
            onClick={() => onSelect(n.id)}
            // eslint-disable-next-line react/forbid-dom-props
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={p.x}
              cy={p.y}
              fill={TIER_FILL[n.tier]}
              r={selected ? 10 : 6}
              stroke={selected ? "var(--color-text, #fff)" : "transparent"}
              strokeWidth={2}
            />
            <text
              fill="var(--color-text-secondary, #cbd5e1)"
              fontSize={11}
              textAnchor="middle"
              x={p.x}
              y={p.y - 12}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Tiny spring/charge simulation, deterministic for a given graph. */
function simulate(graph: Graph): Pos[] {
  const n = graph.nodes.length;
  if (n === 0) return [];
  // Seed positions on a circle (deterministic — no Math.random, stable layout).
  const pos: Pos[] = graph.nodes.map((node, i) => ({
    id: node.id,
    x: WIDTH / 2 + Math.cos((i / n) * Math.PI * 2) * 140,
    y: HEIGHT / 2 + Math.sin((i / n) * Math.PI * 2) * 140,
  }));
  const idx = new Map(pos.map((p, i) => [p.id, i]));

  for (let step = 0; step < 220; step++) {
    // Repulsion between every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos[i];
        const b = pos[j];
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = 2200 / (dist * dist);
        dx /= dist;
        dy /= dist;
        a.x += dx * force;
        a.y += dy * force;
        b.x -= dx * force;
        b.y -= dy * force;
      }
    }
    // Spring along edges.
    for (const e of graph.edges) {
      const ai = idx.get(e.from);
      const bi = idx.get(e.to);
      if (ai === undefined || bi === undefined) continue;
      const a = pos[ai];
      const b = pos[bi];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const k = (dist - 90) * 0.01;
      a.x += dx * k;
      a.y += dy * k;
      b.x -= dx * k;
      b.y -= dy * k;
    }
    // Gentle pull to centre to keep it on-canvas.
    for (const p of pos) {
      p.x += (WIDTH / 2 - p.x) * 0.005;
      p.y += (HEIGHT / 2 - p.y) * 0.005;
    }
  }
  // Clamp inside the viewport with a margin.
  for (const p of pos) {
    p.x = Math.max(24, Math.min(WIDTH - 24, p.x));
    p.y = Math.max(24, Math.min(HEIGHT - 24, p.y));
  }
  return pos;
}
