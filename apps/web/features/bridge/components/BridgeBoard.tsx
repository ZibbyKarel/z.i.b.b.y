"use client";

import { BRIDGE_DENSITY, WidgetBoard, WidgetFrame } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type PointerEvent, useCallback, useMemo, useState } from "react";
import {
  type BridgeWidget,
  type DragOrigin,
  stackLayout,
  toCells,
  viewLayout,
} from "../grid/layout";
import type { BridgeState } from "../state/useBridgeState";
import { type BridgeSelection, type BridgeWidgetInfo, WIDGETS } from "../widgets/registry";
import { boardHeight, colWidth, widgetRect } from "../grid/positions";
import { WidgetSettingsDialog } from "./WidgetSettingsDialog";
import type { Density, ResizeCorner } from "@zibby/design-system";

/** Pointer travel (px) before a header/corner press becomes a drag. */
const DRAG_THRESHOLD = 4;

const pad2 = (n: number) => String(n).padStart(2, "0");

interface HostProps {
  widget: BridgeWidget;
  state: BridgeState;
  sheetSide: "left" | "right";
  onOpen: (selection: BridgeSelection) => void;
  empty: boolean;
  adding: boolean;
  info: BridgeWidgetInfo | undefined;
  style: { left: number; top: number; width: number; height: number };
  onEmpty: (id: string, empty: boolean) => void;
  onInfo: (id: string, info: BridgeWidgetInfo) => void;
  onToggleAdd: (id: string) => void;
  onSettings: (id: string) => void;
  /** Omitted on the stacked phone board — no move/resize there. */
  onDragStart?: (id: string, mode: "move" | ResizeCorner, e: PointerEvent<HTMLElement>) => void;
}

/** One widget: its frame chrome + the registry body, wired to board state. */
function BridgeWidgetHost({
  widget,
  state,
  sheetSide,
  onOpen,
  empty,
  adding,
  info,
  style,
  onEmpty,
  onInfo,
  onToggleAdd,
  onSettings,
  onDragStart,
}: HostProps) {
  const t = useTranslations();
  const { id } = widget;
  const def = WIDGETS[widget.type];
  const onEmptyChange = useCallback((e: boolean) => onEmpty(id, e), [onEmpty, id]);
  const onCountChange = useCallback((i: BridgeWidgetInfo) => onInfo(id, i), [onInfo, id]);

  return (
    <WidgetFrame
      addLabel={t("bridge.add")}
      adding={adding}
      aside={empty && !adding ? t("bridge.allClear") : info?.aside}
      collapseLabel={t("bridge.collapse")}
      collapsed={!!state.collapsed[id]}
      count={info?.count === undefined ? undefined : pad2(info.count)}
      dragging={state.draggingId === id}
      empty={empty}
      emptyIcon={def.icon}
      label={widget.title ?? t(def.labelKey)}
      loading={info?.loading}
      loadingLabel={t("bridge.loading")}
      onAdd={def.addable ? () => onToggleAdd(id) : undefined}
      onMovePointerDown={onDragStart && ((e) => onDragStart(id, "move", e))}
      onRefresh={info?.onRefresh}
      onResizePointerDown={onDragStart && ((e, corner) => onDragStart(id, corner, e))}
      onSettings={() => onSettings(id)}
      onToggleCollapse={() => state.toggleCollapsed(id)}
      refreshLabel={t("bridge.refresh")}
      refreshing={info?.refreshing}
      resizeCornerLabels={{
        nw: t("bridge.resizeNw"),
        ne: t("bridge.resizeNe"),
        sw: t("bridge.resizeSw"),
        se: t("bridge.resizeSe"),
      }}
      resizeLabel={t("bridge.resize")}
      settingsLabel={t("bridge.settings.open")}
      sizeLabel={`${widget.w} × ${widget.h}`}
      style={style}
      you={info?.you ? t("bridge.you", { n: pad2(info.you) }) : undefined}
    >
      <def.Component
        adding={adding}
        epicClosed={state.epicClosed}
        onCountChange={onCountChange}
        onEmptyChange={onEmptyChange}
        onEpicToggle={state.setEpicClosed}
        onOpen={onOpen}
        selection={state.selection}
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
  /** Phone view: widgets one under another, full width, no drag/resize. */
  stacked?: boolean;
  /** What a row click does — defaults to opening the detail sheet. */
  onOpen?: (selection: BridgeSelection) => void;
}

/**
 * The widget board: measures its width, derives the column width from the density table
 * and positions each widget at the fixed width × height from the layout. Collapsed widgets shrink
 * to one row (and the board compacts); while a drag is in progress it shows the raw layout. Header drag moves, corners resize — always on.
 */
export function BridgeBoard({
  state,
  density,
  sheetSide = "right",
  stacked = false,
  onOpen,
}: BridgeBoardProps) {
  const { gap, rowHeight } = BRIDGE_DENSITY[density];
  const { layout, collapsed, draggingId } = state;
  const dragging = draggingId !== null;
  const [width, setWidth] = useState(0);
  const [empty, setEmpty] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  /** Widget whose settings dialog is open. */
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, BridgeWidgetInfo>>({});

  const onEmpty = useCallback(
    (id: string, e: boolean) => setEmpty((p) => (p[id] === e ? p : { ...p, [id]: e })),
    [],
  );
  // Forget the + toggle of a removed widget (a re-added widget with the same id starts closed).
  const onRemove = (id: string) => {
    setAdding((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));
    state.remove(id);
  };
  const onToggleAdd = useCallback((id: string) => setAdding((p) => ({ ...p, [id]: !p[id] })), []);
  const onInfo = useCallback(
    (id: string, i: BridgeWidgetInfo) =>
      setInfo((p) => {
        const prev = p[id];
        return prev &&
          prev.count === i.count &&
          prev.you === i.you &&
          prev.aside === i.aside &&
          prev.onRefresh === i.onRefresh &&
          prev.refreshing === i.refreshing &&
          prev.loading === i.loading
          ? p
          : { ...p, [id]: i };
      }),
    [],
  );

  const shown = useMemo(() => {
    if (dragging) return layout;
    const shrink = new Set(layout.filter((w) => !adding[w.id] && collapsed[w.id]).map((w) => w.id));
    const view = viewLayout(layout, shrink);
    return stacked ? stackLayout(view) : view;
  }, [dragging, layout, collapsed, adding, stacked]);
  const settingsWidget = layout.find((w) => w.id === settingsId);

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
    <>
      <WidgetBoard
        colWidth={colW}
        gap={gap}
        height={Math.round(boardHeight(shown, rowHeight, gap, dragging ? 2 : 0))}
        onMeasure={setWidth}
      >
        {width > 0
          ? shown.map((w) => {
              const r = widgetRect(w, colW, gap, rowHeight);
              return (
                <BridgeWidgetHost
                  adding={!!adding[w.id]}
                  empty={!!empty[w.id]}
                  info={info[w.id]}
                  key={w.id}
                  onDragStart={stacked ? undefined : onDragStart}
                  onEmpty={onEmpty}
                  onInfo={onInfo}
                  onOpen={onOpen ?? state.setSelection}
                  onSettings={setSettingsId}
                  onToggleAdd={onToggleAdd}
                  sheetSide={sheetSide}
                  state={state}
                  style={{
                    left: Math.round(r.left),
                    top: Math.round(r.top),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                  }}
                  widget={w}
                />
              );
            })
          : null}
      </WidgetBoard>
      {settingsWidget ? (
        <WidgetSettingsDialog
          key={settingsWidget.id}
          onClose={() => setSettingsId(null)}
          onRemove={() => onRemove(settingsWidget.id)}
          onSave={(next) => state.updateWidget(settingsWidget.id, next)}
          widget={settingsWidget}
        />
      ) : null}
    </>
  );
}
