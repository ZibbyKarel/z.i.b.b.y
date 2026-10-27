"use client";

import { BRIDGE_DENSITY, WidgetBoard, WidgetFrame } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type PointerEvent, useCallback, useMemo, useState } from "react";
import { type BridgeWidget, type DragOrigin, toCells, viewLayout } from "../grid/layout";
import type { BridgeState } from "../state/useBridgeState";
import { type BridgeWidgetInfo, WIDGETS } from "../widgets/registry";
import { boardHeight, colWidth, rowsFor, widgetRect } from "../grid/positions";
import type { Density, ResizeCorner } from "@zibby/design-system";

/** Pointer travel (px) before a header/corner press becomes a drag. */
const DRAG_THRESHOLD = 4;

const pad2 = (n: number) => String(n).padStart(2, "0");

interface HostProps {
  widget: BridgeWidget;
  state: BridgeState;
  sheetSide: "left" | "right";
  empty: boolean;
  configuring: boolean;
  info: BridgeWidgetInfo | undefined;
  style: { left: number; top: number; width: number; height: number };
  onEmpty: (id: string, empty: boolean) => void;
  onNatural: (id: string, px: number) => void;
  onInfo: (id: string, info: BridgeWidgetInfo) => void;
  onConfigure: (id: string) => void;
  onRemove: (id: string) => void;
  onDragStart: (id: string, mode: "move" | ResizeCorner, e: PointerEvent<HTMLElement>) => void;
}

/** One widget: its frame chrome + the registry body, wired to board state. */
function BridgeWidgetHost({
  widget,
  state,
  sheetSide,
  empty,
  configuring,
  info,
  style,
  onEmpty,
  onNatural,
  onInfo,
  onConfigure,
  onRemove,
  onDragStart,
}: HostProps) {
  const t = useTranslations();
  const { id } = widget;
  const def = WIDGETS[widget.type];
  const onEmptyChange = useCallback((e: boolean) => onEmpty(id, e), [onEmpty, id]);
  const onNaturalHeight = useCallback((px: number) => onNatural(id, px), [onNatural, id]);
  const onCountChange = useCallback((i: BridgeWidgetInfo) => onInfo(id, i), [onInfo, id]);
  const { selection, configure } = state;
  const onScopeChange = useCallback(
    (scope: BridgeWidget["scope"]) => configure(id, scope),
    [configure, id],
  );

  return (
    <WidgetFrame
      aside={empty && !configuring ? t("bridge.allClear") : info?.aside}
      collapseLabel={t("bridge.collapse")}
      collapsed={!!state.collapsed[id]}
      configureLabel={t("bridge.configure")}
      configuring={configuring}
      count={info?.count === undefined ? undefined : pad2(info.count)}
      dragging={state.draggingId === id}
      empty={empty}
      label={t(def.labelKey)}
      loading={info?.loading}
      loadingLabel={t("bridge.loading")}
      onConfigure={def.configurable ? () => onConfigure(id) : undefined}
      onMovePointerDown={(e) => onDragStart(id, "move", e)}
      onNaturalHeight={onNaturalHeight}
      onRemove={() => onRemove(id)}
      onResizePointerDown={(e, corner) => onDragStart(id, corner, e)}
      onToggleCollapse={() => state.toggleCollapsed(id)}
      removeLabel={t("bridge.remove")}
      resizeCornerLabels={{
        nw: t("bridge.resizeNw"),
        ne: t("bridge.resizeNe"),
        sw: t("bridge.resizeSw"),
        se: t("bridge.resizeSe"),
      }}
      resizeLabel={t("bridge.resize")}
      sizeLabel={`${widget.w} × ${widget.h}`}
      style={style}
      you={info?.you ? t("bridge.you", { n: pad2(info.you) }) : undefined}
    >
      <def.Component
        editing={configuring}
        epicClosed={state.epicClosed}
        onCountChange={onCountChange}
        onEmptyChange={onEmptyChange}
        onEpicToggle={state.setEpicClosed}
        onOpen={state.setSelection}
        onScopeChange={onScopeChange}
        selection={selection}
        sheetSide={sheetSide}
        widget={widget}
      />
    </WidgetFrame>
  );
}

export interface BridgeBoardProps {
  state: BridgeState;
  density: Density;
  sheetSide?: "left" | "right";
}

/**
 * The widget board: measures its width, derives the column width from the density table
 * and positions each widget. Shrinks empty/collapsed widgets to one row, fits every other
 * widget to its content up to its layout height, and compacts; while a drag is in progress it
 * shows the raw layout (real sizes). Header drag moves, corners resize — always on.
 */
export function BridgeBoard({ state, density, sheetSide = "right" }: BridgeBoardProps) {
  const { gap, rowHeight } = BRIDGE_DENSITY[density];
  const { layout, collapsed, draggingId } = state;
  const dragging = draggingId !== null;
  const [width, setWidth] = useState(0);
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const [natural, setNatural] = useState<Record<string, number>>({});
  const [configuring, setConfiguring] = useState<Record<string, boolean>>({});
  const [info, setInfo] = useState<Record<string, BridgeWidgetInfo>>({});

  const onEmpty = useCallback(
    (id: string, e: boolean) => setEmpty((p) => (p[id] === e ? p : { ...p, [id]: e })),
    [],
  );
  const onNatural = useCallback(
    (id: string, px: number) => setNatural((p) => (p[id] === px ? p : { ...p, [id]: px })),
    [],
  );
  // Forget the configure toggle of a removed widget (re-adding it starts unconfigured).
  const onRemove = useCallback(
    (id: string) => {
      setConfiguring((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));
      state.remove(id);
    },
    [state],
  );
  const onConfigure = useCallback(
    (id: string) => setConfiguring((p) => ({ ...p, [id]: !p[id] })),
    [],
  );
  const onInfo = useCallback(
    (id: string, i: BridgeWidgetInfo) =>
      setInfo((p) => {
        const prev = p[id];
        return prev &&
          prev.count === i.count &&
          prev.you === i.you &&
          prev.aside === i.aside &&
          prev.loading === i.loading
          ? p
          : { ...p, [id]: i };
      }),
    [],
  );

  const shown = useMemo(() => {
    if (dragging) return layout;
    const shrink = new Set(
      layout.filter((w) => !configuring[w.id] && (collapsed[w.id] || empty[w.id])).map((w) => w.id),
    );
    const fitRows = Object.fromEntries(
      Object.entries(natural).map(([id, px]) => [id, rowsFor(px, rowHeight, gap)]),
    );
    return viewLayout(layout, shrink, fitRows);
  }, [dragging, layout, collapsed, empty, configuring, natural, rowHeight, gap]);

  const colW = colWidth(width, gap);

  const onDragStart = (id: string, mode: "move" | ResizeCorner, e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const it = state.layoutRef.current.find((w) => w.id === id);
    if (!it) return;
    const origin = { x: it.x, y: it.y, w: it.w, h: it.h };
    const [sx, sy] = [e.clientX, e.clientY];
    const apply =
      mode === "move"
        ? state.move
        : (i: string, o: DragOrigin, dx: number, dy: number) => state.resize(i, o, dx, dy, mode);
    let started = false;
    // A plain click must not flip the board to the raw layout: drag only after DRAG_THRESHOLD px.
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
        started = true;
        state.beginDrag(id);
      }
      const { dx, dy } = toCells(ev.clientX - sx, ev.clientY - sy, colW, gap, rowHeight);
      apply(id, origin, dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (started) state.endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <WidgetBoard
      colWidth={colW}
      gap={gap}
      guides={dragging}
      height={Math.round(boardHeight(shown, rowHeight, gap, dragging ? 2 : 0))}
      onMeasure={setWidth}
    >
      {width > 0
        ? shown.map((w) => {
            const r = widgetRect(w, colW, gap, rowHeight);
            return (
              <BridgeWidgetHost
                configuring={!!configuring[w.id]}
                empty={!!empty[w.id]}
                info={info[w.id]}
                key={w.id}
                onConfigure={onConfigure}
                onDragStart={onDragStart}
                onEmpty={onEmpty}
                onInfo={onInfo}
                onNatural={onNatural}
                onRemove={onRemove}
                sheetSide={sheetSide}
                state={state}
                style={{
                  left: Math.round(r.left),
                  top: Math.round(r.top),
                  width: Math.round(r.width),
                  height: Math.round(
                    dragging ? r.height : Math.min(r.height, natural[w.id] ?? r.height),
                  ),
                }}
                widget={w}
              />
            );
          })
        : null}
    </WidgetBoard>
  );
}
