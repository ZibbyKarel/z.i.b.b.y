"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UiSettings } from "@zibby/contracts";
import { useUiSettings } from "../../system";
import {
  type BridgeWidget,
  type DragOrigin,
  type WidgetType,
  addWidget,
  compact,
  dragMove,
  dragResize,
  removeWidget,
} from "../grid/layout";
import { DEFAULT_PRESET, layoutNameError, nextSavedName, presetLayout } from "../grid/presets";
import type { BridgeSelection } from "../widgets/registry";

export const CUSTOM_PRESET = "CUSTOM";

type BridgeUi = UiSettings["bridge"];

/**
 * Bridge screen state. Persisted bits (layout / preset / saved / collapsed / epicClosed) live in
 * `ui.bridge` (server, debounced by `useUiSettings.setBridge`); a local overlay keeps every change
 * instant so drags and toggles don't wait for the round trip. editing / catalog / dragging /
 * selection are local. Esc closes selection → catalog → edit mode.
 */
export function useBridgeState() {
  const { ui, setBridge } = useUiSettings();
  const [local, setLocal] = useState<Partial<BridgeUi>>({});
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** The open detail-sheet row; null until the sheet task wires rows to `setSelection`. */
  const [selection, setSelection] = useState<BridgeSelection | null>(null);

  const bridge = { ...ui.bridge, ...local };
  const { preset, saved, collapsed, epicClosed } = bridge;
  const favorites = bridge.favorites.filter((n) => n in saved);
  const layout = useMemo(
    () => bridge.layout ?? presetLayout(preset, saved),
    [bridge.layout, preset, saved],
  );
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const update = useCallback(
    (patch: Partial<BridgeUi>) => {
      setLocal((p) => ({ ...p, ...patch }));
      setBridge(patch);
    },
    [setBridge],
  );

  /** A manual layout change — flips the preset to CUSTOM. */
  const commitLayout = useCallback(
    (next: BridgeWidget[]) => {
      layoutRef.current = next;
      update({ layout: next, preset: CUSTOM_PRESET });
    },
    [update],
  );

  const applyPreset = useCallback(
    (name: string) => update({ layout: presetLayout(name, saved), preset: name }),
    [update, saved],
  );
  const reset = useCallback(() => applyPreset(DEFAULT_PRESET), [applyPreset]);

  const saveAs = useCallback(
    (raw: string) => {
      const name = raw.trim();
      if (layoutNameError(name, saved)) return;
      update({
        saved: { ...saved, [name]: layout },
        favorites: [...favorites, name],
        preset: name,
      });
    },
    [update, saved, favorites, layout],
  );

  const deleteSaved = useCallback(
    (name: string) => {
      const rest = { ...saved };
      delete rest[name];
      update({
        saved: rest,
        favorites: favorites.filter((n) => n !== name),
        ...(preset === name ? { preset: CUSTOM_PRESET, layout } : {}),
      });
    },
    [update, saved, favorites, preset, layout],
  );

  const toggleFavorite = useCallback(
    (name: string) =>
      update({
        favorites: favorites.includes(name)
          ? favorites.filter((n) => n !== name)
          : [...favorites, name],
      }),
    [update, favorites],
  );
  const nextName = nextSavedName(saved);

  const toggleCollapsed = useCallback(
    (id: string) => update({ collapsed: { ...collapsed, [id]: !collapsed[id] } }),
    [update, collapsed],
  );
  const setEpicClosed = useCallback(
    (key: string, closed: boolean) => update({ epicClosed: { ...epicClosed, [key]: closed } }),
    [update, epicClosed],
  );

  const move = useCallback(
    (id: string, origin: DragOrigin, dx: number, dy: number) =>
      commitLayout(dragMove(layoutRef.current, id, origin, dx, dy)),
    [commitLayout],
  );
  const resize = useCallback(
    (id: string, origin: DragOrigin, dx: number, dy: number) =>
      commitLayout(dragResize(layoutRef.current, id, origin, dx, dy)),
    [commitLayout],
  );
  const add = useCallback(
    (type: WidgetType) => commitLayout(addWidget(layoutRef.current, type)),
    [commitLayout],
  );
  const remove = useCallback(
    (id: string) => commitLayout(removeWidget(layoutRef.current, id)),
    [commitLayout],
  );

  const toggleEditing = useCallback(() => {
    setEditing((e) => !e);
    setCatalogOpen(false);
    setSelection(null);
  }, []);
  const toggleCatalog = useCallback(() => setCatalogOpen((o) => !o), []);
  const closeCatalog = useCallback(() => setCatalogOpen(false), []);
  const closeSelection = useCallback(() => setSelection(null), []);
  const beginDrag = useCallback((id: string) => setDraggingId(id), []);
  /** Drag end: a final compact WITHOUT priority (reference parity); CUSTOM only if it moved anything. */
  const endDrag = useCallback(() => {
    setDraggingId(null);
    const cur = layoutRef.current;
    const settled = compact(cur);
    if (JSON.stringify(settled) !== JSON.stringify(cur)) commitLayout(settled);
  }, [commitLayout]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target;
      if (el instanceof HTMLElement && el.closest('[aria-modal="true"]')) return;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;
      if (selection) setSelection(null);
      else if (catalogOpen) setCatalogOpen(false);
      else if (editing) setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, catalogOpen, editing]);

  return {
    layout,
    layoutRef,
    preset,
    saved,
    favorites,
    nextName,
    collapsed,
    epicClosed,
    editing,
    catalogOpen: editing && catalogOpen,
    draggingId,
    selection,
    setSelection,
    closeSelection,
    applyPreset,
    saveAs,
    deleteSaved,
    toggleFavorite,
    reset,
    toggleCollapsed,
    setEpicClosed,
    move,
    resize,
    add,
    remove,
    beginDrag,
    endDrag,
    toggleEditing,
    toggleCatalog,
    closeCatalog,
  };
}

export type BridgeState = ReturnType<typeof useBridgeState>;
