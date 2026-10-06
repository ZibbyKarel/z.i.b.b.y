"use client";

import type { MouseEvent } from "react";
import { stateToneVar } from "../../stateTone";
import type { FloorplanLayout } from "./layoutFloorplan";
import { type OrgFloorplanRoom, OrgFloorplanTestId } from "./types";

const MAX_W = 150;
const MAX_H = 300;

export interface FloorplanMinimapProps {
  layout: FloorplanLayout;
  rooms: readonly OrgFloorplanRoom[];
  /** Current transform and canvas size — drives the viewport rectangle. */
  view: { tx: number; ty: number; k: number };
  viewport: { w: number; h: number };
  /** World coordinate the user clicked — the canvas centres on it. */
  onCenter: (wx: number, wy: number) => void;
  label: string;
}

/** Scaled-down overview: rooms, agent dots, lobby and the current viewport. */
export function FloorplanMinimap({
  layout,
  rooms,
  view,
  viewport,
  onCenter,
  label,
}: FloorplanMinimapProps) {
  const s = Math.min(MAX_W / layout.W, MAX_H / layout.H);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const click = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onCenter((e.clientX - r.left) / s, (e.clientY - r.top) / s);
  };
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-[80px] left-[16px] cursor-pointer border border-ink bg-panel"
      data-testid={OrgFloorplanTestId.Minimap}
      onClick={click}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ width: Math.round(layout.W * s), height: Math.round(layout.H * s) }}
    >
      {layout.rooms.map((p) => (
        <div
          className="absolute box-border border border-ink-3 bg-panel-2"
          data-testid={`${OrgFloorplanTestId.MinimapRoom}-${p.id}`}
          key={p.id}
          style={{ left: p.x * s, top: p.y * s, width: p.w * s, height: p.h * s }}
        />
      ))}
      <div
        className="absolute box-border border border-ink"
        style={{
          left: layout.lobby.x * s,
          top: layout.lobby.y * s,
          width: layout.lobby.size * s,
          height: layout.lobby.size * s,
        }}
      />
      {layout.rooms.flatMap((p) =>
        (roomById.get(p.id)?.agents ?? []).map((a, i) => {
          const d = p.desks[i];
          return d ? (
            <div
              className="absolute h-[3px] w-[3px]"
              data-testid={`${OrgFloorplanTestId.MinimapDot}-${a.id}`}
              key={a.id}
              style={{
                left: (p.x + d.x + 36) * s - 1.5,
                top: (p.y + d.y + 18) * s - 1.5,
                background: stateToneVar[a.state],
              }}
            />
          ) : null;
        }),
      )}
      <div
        className="pointer-events-none absolute box-border border border-ink"
        data-testid={OrgFloorplanTestId.MinimapViewport}
        style={{
          left: (-view.tx / view.k) * s,
          top: (-view.ty / view.k) * s,
          width: (viewport.w / view.k) * s,
          height: (viewport.h / view.k) * s,
        }}
      />
      <span className="absolute left-[6px] top-[-18px] font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        {label}
      </span>
    </div>
  );
}
