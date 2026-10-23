"use client";

import { BRIDGE_DENSITY, WidgetBoard, WidgetFrame } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type PointerEvent, useCallback, useMemo, useState } from "react";
import { type BridgeWidget, toCells, viewLayout } from "../grid/layout";
import type { BridgeState } from "../state/useBridgeState";
import { type BridgeWidgetInfo, WIDGETS } from "../widgets/registry";
import { boardHeight, colWidth, rowsFor, widgetRect } from "../grid/positions";
import type { Density } from "@zibby/design-system";

const pad2 = (n: number) => String(n).padStart(2, "0");

interface HostProps {
  widget: BridgeWidget;
  state: BridgeState;
  sheetSide: "left" | "right";
  empty: boolean;
  info: BridgeWidgetInfo | undefined;
  style: { left: number; top: number; width: number; height: number };
  onEmpty: (id: string, empty: boolean) => void;
  onNatural: (id: string, px: number) => void;
  onInfo: (id: string, info: BridgeWidgetInfo) => void;
  onDragStart: (id: string, mode: "move" | "resize", e: PointerEvent<HTMLElement>) => void;
}

/** One widget: its frame chrome + the registry body, wired to board state. */
function BridgeWidgetHost({
  widget,
  state,
  sheetSide,
  empty,
  info,
  style,
  onEmpty,
  onNatural,
  onInfo,
  onDragStart,
}: HostProps) {
  const t = useTranslations();
  const { id } = widget;
  const def = WIDGETS[widget.type];
  const onEmptyChange = useCallback((e: boolean) => onEmpty(id, e), [onEmpty, id]);
  const onNaturalHeight = useCallback((px: number) => onNatural(id, px), [onNatural, id]);
  const onCountChange = useCallback((i: BridgeWidgetInfo) => onInfo(id, i), [onInfo, id]);
  const { editing, selection } = state;

  return (
    <WidgetFrame
      aside={empty && !editing ? t("bridge.allClear") : info?.aside}
      collapseLabel={t("bridge.collapse")}
      collapsed={!!state.collapsed[id]}
      count={info?.count === undefined ? undefined : pad2(info.count)}
      dragging={state.draggingId === id}
      editing={editing}
      empty={empty}
      emptyText={t("bridge.emptyWidget")}
      label={t(def.labelKey)}
      loading={info?.loading}
      loadingLabel={t("bridge.loading")}
      onMovePointerDown={(e) => onDragStart(id, "move", e)}
      onNaturalHeight={onNaturalHeight}
      onRemove={() => state.remove(id)}
      onResizePointerDown={(e) => onDragStart(id, "resize", e)}
      onToggleCollapse={() => state.toggleCollapsed(id)}
      removeLabel={t("bridge.remove")}
      resizeLabel={t("bridge.resize")}
      sizeLabel={`${widget.w} × ${widget.h}`}
      style={style}
      you={info?.you ? t("bridge.you", { n: pad2(info.you) }) : undefined}
    >
      <def.Component
        editing={editing}
        epicClosed={state.epicClosed}
        onCountChange={onCountChange}
        onEmptyChange={onEmptyChange}
        onEpicToggle={state.setEpicClosed}
        onOpen={state.setSelection}
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
 * and positions each widget. View mode shrinks empty/collapsed widgets to one row, fits
 * every other widget to its content up to its layout height, and compacts; edit mode
 * keeps real sizes and handles pointer drags (move / resize).
 */
export function BridgeBoard({ state, density, sheetSide = "right" }: BridgeBoardProps) {
  const { gap, rowHeight } = BRIDGE_DENSITY[density];
  const { layout, editing, collapsed } = state;
  const [width, setWidth] = useState(0);
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const [natural, setNatural] = useState<Record<string, number>>({});
  const [info, setInfo] = useState<Record<string, BridgeWidgetInfo>>({});

  const onEmpty = useCallback(
    (id: string, e: boolean) => setEmpty((p) => (p[id] === e ? p : { ...p, [id]: e })),
    [],
  );
  const onNatural = useCallback(
    (id: string, px: number) => setNatural((p) => (p[id] === px ? p : { ...p, [id]: px })),
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
    if (editing) return layout;
    const shrink = new Set(layout.filter((w) => collapsed[w.id] || empty[w.id]).map((w) => w.id));
    const fitRows = Object.fromEntries(
      Object.entries(natural).map(([id, px]) => [id, rowsFor(px, rowHeight, gap)]),
    );
    return viewLayout(layout, shrink, fitRows);
  }, [editing, layout, collapsed, empty, natural, rowHeight, gap]);

  const colW = colWidth(width, gap);

  const onDragStart = (id: string, mode: "move" | "resize", e: PointerEvent<HTMLElement>) => {
    if (!editing || e.button !== 0) return;
    e.preventDefault();
    const it = state.layoutRef.current.find((w) => w.id === id);
    if (!it) return;
    const origin = { x: it.x, y: it.y, w: it.w, h: it.h };
    const [sx, sy] = [e.clientX, e.clientY];
    const apply = mode === "move" ? state.move : state.resize;
    const onMove = (ev: globalThis.PointerEvent) => {
      const { dx, dy } = toCells(ev.clientX - sx, ev.clientY - sy, colW, gap, rowHeight);
      apply(id, origin, dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      state.endDrag();
    };
    state.beginDrag(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <WidgetBoard
      colWidth={colW}
      editing={editing}
      gap={gap}
      height={Math.round(boardHeight(shown, rowHeight, gap, editing ? 2 : 0))}
      onMeasure={setWidth}
    >
      {width > 0
        ? shown.map((w) => {
            const r = widgetRect(w, colW, gap, rowHeight);
            return (
              <BridgeWidgetHost
                empty={!!empty[w.id]}
                info={info[w.id]}
                key={w.id}
                onDragStart={onDragStart}
                onEmpty={onEmpty}
                onInfo={onInfo}
                onNatural={onNatural}
                sheetSide={sheetSide}
                state={state}
                style={{
                  left: Math.round(r.left),
                  top: Math.round(r.top),
                  width: Math.round(r.width),
                  height: Math.round(
                    editing ? r.height : Math.min(r.height, natural[w.id] ?? r.height),
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
