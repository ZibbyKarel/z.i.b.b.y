"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { STATE_LABEL, type StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { FloorplanMinimap } from "./FloorplanMinimap";
import { FloorplanPopover, POPOVER_WIDTH } from "./FloorplanPopover";
import { FloorplanWorld } from "./FloorplanWorld";
import { DEFAULT_FLOORPLAN_ROWS, type FloorplanRowSpec, layoutFloorplan } from "./layoutFloorplan";
import {
  DEFAULT_FLOORPLAN_LABELS,
  type FloorplanHover,
  type FloorplanHoverSubject,
  type OrgFloorplanCoo,
  type OrgFloorplanLabels,
  type OrgFloorplanRoom,
  OrgFloorplanTestId,
} from "./types";

export { OrgFloorplanTestId } from "./types";
export type {
  OrgFloorplanAgent,
  OrgFloorplanCoo,
  OrgFloorplanLabels,
  OrgFloorplanRoom,
  OrgFloorplanZone,
} from "./types";
export { DEFAULT_FLOORPLAN_ROWS, type FloorplanRowSpec } from "./layoutFloorplan";

const MIN_K = 0.2;
const MAX_K = 2.5;
const FIT_MIN_K = 0.35;
/** A drag longer than this (px, Manhattan) is a pan, not a click. */
const DRAG_THRESHOLD = 4;
const GRID_BG =
  "bg-[linear-gradient(var(--color-grid)_1px,transparent_1px),linear-gradient(90deg,var(--color-grid)_1px,transparent_1px)] bg-[length:24px_24px]";
const CONTROL = "px-[12px] py-[8px] cursor-pointer " + focusRing;

interface View {
  tx: number;
  ty: number;
  k: number;
}

export interface OrgFloorplanProps {
  rooms: OrgFloorplanRoom[];
  /** Placement table; default = dev / com·knw·fin / rnd·qa / dist·pub·des / sec·rel·per / ops·inc. */
  rows?: readonly FloorplanRowSpec[];
  coo: OrgFloorplanCoo;
  onRoomClick?: (roomId: string) => void;
  onAgentClick?: (roomId: string, agentId: string) => void;
  onCooClick?: () => void;
  /** Control / popover copy (English defaults) — the app passes translations. */
  labels?: Partial<OrgFloorplanLabels>;
  /** State names shown in the popover; defaults to {@link STATE_LABEL}. */
  stateLabels?: Partial<Record<StateTone, string>>;
  /** Slot over the canvas, top-right (e.g. an "add" button). */
  actions?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The ORG floorplan (`design/ZibbyCorp/Floorplan Map.dc.html`): every department is a
 * room, every agent a desk, Zibby sits in the lobby on the spine. Scroll / drag pans,
 * ⌘/Ctrl + scroll (or pinch) and the buttons zoom; a minimap overviews. i18n- and
 * data-agnostic.
 */
export function OrgFloorplan({
  rooms,
  rows = DEFAULT_FLOORPLAN_ROWS,
  coo,
  onRoomClick,
  onAgentClick,
  onCooClick,
  labels,
  stateLabels,
  actions,
  ref,
}: OrgFloorplanProps) {
  const text = { ...DEFAULT_FLOORPLAN_LABELS, ...labels };
  const names = useMemo(() => ({ ...STATE_LABEL, ...stateLabels }), [stateLabels]);
  const layout = useMemo(
    () =>
      layoutFloorplan(
        rooms.map((r) => ({ id: r.id, agentCount: r.agents.length })),
        rows,
      ),
    [rooms, rows],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ tx: 0, ty: 0, k: FIT_MIN_K });
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Scale at which the plan fills the canvas — shown as 100%. */
  const [fillK, setFillK] = useState(FIT_MIN_K);
  /** The zoom input's text while the user edits it; null = show the live zoom. */
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  const [hover, setHover] = useState<FloorplanHover | null>(null);
  const moved = useRef(false);
  const dragging = useRef(false);
  /** The user panned/zoomed — stop auto-fitting when the data changes size. */
  const touched = useRef(false);
  const stopDrag = useRef<(() => void) | null>(null);
  const handlers = useRef({ onRoomClick, onAgentClick, onCooClick });
  useEffect(() => {
    handlers.current = { onRoomClick, onAgentClick, onCooClick };
  });

  const fit = useCallback(() => {
    const v = viewportRef.current;
    if (!v) return;
    const w = v.clientWidth;
    const h = v.clientHeight;
    setSize({ w, h });
    const k = Math.max(FIT_MIN_K, Math.min(w / layout.W, h / layout.H) * 0.97);
    setFillK(k);
    setView({ k, tx: (w - layout.W * k) / 2, ty: Math.min(8, (h - layout.H * k) / 2) });
  }, [layout.W, layout.H]);

  // Fit on mount and whenever the plan's size changes (until the user takes over).
  useLayoutEffect(() => {
    if (!touched.current) fit();
  }, [fit]);

  // Fit on resize — always, like the mockup.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      touched.current = false;
      fit();
    });
    ro.observe(v);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    touched.current = true;
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      const r = k / v.k;
      return { k, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r };
    });
  }, []);

  // Wheel must be a non-passive native listener to preventDefault the page scroll.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setHover(null);
      // ⌘ (mac) / Ctrl zooms — trackpad pinch also arrives as ctrlKey. Plain scroll pans.
      if (e.ctrlKey || e.metaKey) {
        const r = v.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
        return;
      }
      touched.current = true;
      setView((s) => ({ ...s, tx: s.tx - e.deltaX, ty: s.ty - e.deltaY }));
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => () => stopDrag.current?.(), []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    moved.current = false;
    dragging.current = true;
    const sx = e.clientX;
    const sy = e.clientY;
    const start = view;
    const move = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > DRAG_THRESHOLD) {
        moved.current = true;
        touched.current = true;
      }
      if (!moved.current) return;
      setView({ ...start, tx: start.tx + ev.clientX - sx, ty: start.ty + ev.clientY - sy });
      setHover(null);
    };
    const up = () => {
      dragging.current = false;
      stopDrag.current?.();
      // The click that ends a drag fires right after mouseup — clear the flag after it.
      setTimeout(() => {
        moved.current = false;
      }, 0);
    };
    stopDrag.current = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      stopDrag.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const showHover = useCallback((subject: FloorplanHoverSubject | null, el?: HTMLElement) => {
    if (!subject || !el) return setHover(null);
    if (dragging.current && moved.current) return;
    const r = el.getBoundingClientRect();
    let x = r.right + 10;
    if (x + POPOVER_WIDTH + 10 > window.innerWidth) x = r.left - POPOVER_WIDTH - 10;
    setHover({
      subject,
      x: Math.max(8, x),
      y: r.top - 40,
    });
  }, []);

  const clickRoom = useCallback((id: string) => {
    if (!moved.current) handlers.current.onRoomClick?.(id);
  }, []);
  const clickAgent = useCallback((roomId: string, agentId: string) => {
    if (!moved.current) handlers.current.onAgentClick?.(roomId, agentId);
  }, []);
  const clickCoo = useCallback(() => {
    if (!moved.current) handlers.current.onCooClick?.();
  }, []);

  const center = (wx: number, wy: number) => {
    touched.current = true;
    setView((v) => ({ ...v, tx: size.w / 2 - wx * v.k, ty: size.h / 2 - wy * v.k }));
  };
  const zoomFromCenter = (f: number) => zoomAt(f, size.w / 2, size.h / 2);
  const zoomPercent = Math.round((view.k / fillK) * 100);
  const commitZoom = () => {
    const pct = Number.parseFloat(zoomDraft ?? "");
    setZoomDraft(null);
    if (Number.isFinite(pct) && pct > 0) zoomFromCenter((fillK * pct) / 100 / view.k);
  };
  const fill = () => {
    touched.current = false;
    fit();
  };

  return (
    <div
      className="relative box-border grid h-full min-h-[420px] w-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-bg text-ink"
      data-testid={OrgFloorplanTestId.Root}
      ref={ref}
    >
      <div
        className={cn("relative cursor-default select-none overflow-hidden bg-bg", GRID_BG)}
        data-testid={OrgFloorplanTestId.Canvas}
        onMouseDown={onMouseDown}
        ref={viewportRef}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          data-testid={OrgFloorplanTestId.World}
          style={{
            width: layout.W,
            height: layout.H,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`,
          }}
        >
          <FloorplanWorld
            coo={coo}
            layout={layout}
            onAgent={clickAgent}
            onCoo={clickCoo}
            onHover={showHover}
            onRoom={clickRoom}
            rooms={rooms}
            stateLabels={names}
          />
        </div>
        <div
          className="absolute bottom-[16px] left-[16px] flex cursor-default items-center border border-line-2 bg-panel font-mono text-[10px] uppercase tracking-[0.12em]"
          data-testid={OrgFloorplanTestId.Controls}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            aria-label={text.zoomOut}
            className={cn(CONTROL, "border-r border-line-2")}
            data-testid={OrgFloorplanTestId.ZoomOut}
            onClick={() => zoomFromCenter(0.8)}
            type="button"
          >
            −
          </button>
          <input
            aria-label={text.zoomLevel}
            className={cn(
              "w-[56px] bg-transparent px-[8px] py-[8px] text-center text-ink-2",
              focusRing,
            )}
            data-testid={OrgFloorplanTestId.ZoomLabel}
            inputMode="decimal"
            onBlur={commitZoom}
            onChange={(e) => setZoomDraft(e.target.value)}
            onFocus={(e) => {
              setZoomDraft(String(zoomPercent));
              e.target.select();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setZoomDraft(null);
                e.currentTarget.blur();
              }
            }}
            type="text"
            value={zoomDraft ?? `${zoomPercent}%`}
          />
          <button
            aria-label={text.zoomIn}
            className={cn(CONTROL, "border-l border-line-2")}
            data-testid={OrgFloorplanTestId.ZoomIn}
            onClick={() => zoomFromCenter(1.25)}
            type="button"
          >
            +
          </button>
          <button
            className={cn(CONTROL, "border-l border-line-2 bg-ink text-panel")}
            data-testid={OrgFloorplanTestId.Fill}
            onClick={fill}
            type="button"
          >
            {text.fill}
          </button>
        </div>
        {actions && (
          <div
            className="absolute right-[16px] top-[16px] cursor-default"
            data-testid={OrgFloorplanTestId.Actions}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
        <FloorplanMinimap
          label={text.minimap}
          layout={layout}
          onCenter={center}
          rooms={rooms}
          view={view}
          viewport={size}
        />
      </div>
      {hover && <FloorplanPopover hover={hover} stateLabels={names} workingOn={text.workingOn} />}
    </div>
  );
}
