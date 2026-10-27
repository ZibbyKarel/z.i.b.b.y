"use client";

import { useSearchParams } from "next/navigation";
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
import {
  type Arrangement,
  DEFAULT_LAYOUT,
  DEFAULT_PRESET,
  REVIEW_PRESET,
  arrangement,
  layoutNameError,
  layoutNames,
  nextSavedName,
  presetLayout,
} from "../grid/presets";
import type { BridgeSelection } from "../widgets/registry";

export const CUSTOM_PRESET = "CUSTOM";

type BridgeUi = UiSettings["bridge"];

/**
 * Detail-sheet kinds mirrored in the URL (`?issue=<project>/<item>`, `?pull-request=<url>`,
 * `?run=<runId>`) so an open sheet survives a reload and can be linked. Widget ids equal their
 * type, so the row key is derivable. A task row keys by its run, not the task id — it stays local.
 */
const SELECTION_PARAMS = { issue: "issue", pr: "pull-request", run: "run" } as const;
const SELECTION_WIDGETS = { issue: "issues", pr: "prs", run: "runs" } as const;
const URL_KINDS = Object.keys(SELECTION_PARAMS) as (keyof typeof SELECTION_PARAMS)[];

export function selectionFromParams(
  params: Pick<URLSearchParams, "get"> | null,
): BridgeSelection | null {
  for (const kind of URL_KINDS) {
    const id = params?.get(SELECTION_PARAMS[kind]);
    if (!id) continue;
    const widgetId = SELECTION_WIDGETS[kind];
    return { kind, id, widgetId, key: `${widgetId}:${id}` };
  }
  return null;
}

/**
 * Bridge screen state. Persisted bits (layout / preset / saved / arranged / removed / collapsed /
 * epicClosed) live in `ui.bridge` (server, debounced by `useUiSettings.setBridge`); a local overlay
 * keeps every change instant so drags and toggles don't wait for the round trip. The edit target,
 * its unsaved draft, catalog / dragging / selection are local: edits change only the draft until
 * `saveEdit` writes it into the target layout. Esc closes selection → catalog → edit mode
 * (discarding the draft).
 */
export function useBridgeState() {
  const { ui, setBridge } = useUiSettings();
  const [local, setLocal] = useState<Partial<BridgeUi>>({});
  /** The layout being edited (never DEFAULT); null outside edit mode. */
  const [editTarget, setEditTarget] = useState<string | null>(null);
  /** Unsaved edits of `editTarget`; null until the first change. */
  const [draft, setDraft] = useState<BridgeWidget[] | null>(null);
  const editing = editTarget !== null;
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** The open detail-sheet row; null until the sheet task wires rows to `setSelection`. */
  const searchParams = useSearchParams();
  const [selection, setSelection] = useState<BridgeSelection | null>(() =>
    selectionFromParams(searchParams),
  );

  const bridge = { ...ui.bridge, ...local };
  const { preset, saved, removed, collapsed, epicClosed } = bridge;
  const { arranged, favorites } = bridge;
  const layouts = useMemo(
    () => arrangement(layoutNames(saved, removed), arranged, favorites),
    [saved, removed, arranged, favorites],
  );
  const persistedLayout = useMemo(
    () => bridge.layout ?? presetLayout(preset, saved),
    [bridge.layout, preset, saved],
  );
  const layout = draft ?? persistedLayout;
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

  /** A manual layout change (edit mode) — lands in the draft, not in the persisted board. */
  const commitLayout = useCallback((next: BridgeWidget[]) => {
    layoutRef.current = next;
    setDraft(next);
  }, []);

  /** Switch layout. Ignored while editing — leave edit mode (save/cancel) first. */
  const applyPreset = useCallback(
    (name: string) => {
      if (editTarget) return;
      update({ layout: presetLayout(name, saved), preset: name });
    },
    [update, saved, editTarget],
  );

  const leaveEditing = useCallback(() => {
    setEditTarget(null);
    setDraft(null);
    setCatalogOpen(false);
  }, []);

  /** Select `name` and enter edit mode on it (DEFAULT is not editable). */
  const startEditing = useCallback(
    (name: string) => {
      if (name === DEFAULT_PRESET) return;
      applyPreset(name);
      setDraft(null);
      setSelection(null);
      setEditTarget(name);
    },
    [applyPreset],
  );

  /** Write the edited board into the target layout and leave edit mode. */
  const saveEdit = useCallback(() => {
    if (!editTarget) return;
    const next = layoutRef.current;
    update({ saved: { ...saved, [editTarget]: next }, layout: next, preset: editTarget });
    leaveEditing();
  }, [editTarget, update, saved, leaveEditing]);

  /** Add a layout — a copy of DEFAULT — as the last hidden one. False if the name is invalid. */
  const addLayout = useCallback(
    (raw: string) => {
      const name = raw.trim();
      if (layoutNameError(name, saved)) return false;
      update({
        saved: { ...saved, [name]: compact(DEFAULT_LAYOUT) },
        arranged: { shown: layouts.shown, hidden: [...layouts.hidden, name] },
      });
      return true;
    },
    [update, saved, layouts.shown, layouts.hidden],
  );

  /** Delete a layout (anything but DEFAULT); deleting the active one switches to DEFAULT first. */
  const deleteLayout = useCallback(
    (name: string) => {
      if (name === DEFAULT_PRESET) return;
      const rest = { ...saved };
      delete rest[name];
      const without = (ns: readonly string[]) => ns.filter((n) => n !== name);
      update({
        saved: rest,
        arranged: { shown: without(layouts.shown), hidden: without(layouts.hidden) },
        favorites: without(favorites),
        ...(name === REVIEW_PRESET && !removed.includes(name)
          ? { removed: [...removed, name] }
          : {}),
        ...(preset === name
          ? { preset: DEFAULT_PRESET, layout: presetLayout(DEFAULT_PRESET, {}) }
          : {}),
      });
      if (editTarget === name) leaveEditing();
    },
    [update, saved, layouts, favorites, removed, preset, editTarget, leaveEditing],
  );

  /** Persist a new header/dropdown split from the layout manager. */
  const arrange = useCallback((next: Arrangement) => update({ arranged: next }), [update]);
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

  /** Set one widget's scope (e.g. the team of a `teamKb` widget) — lands in the edit draft. */
  const configure = useCallback(
    (id: string, scope: BridgeWidget["scope"]) =>
      commitLayout(layoutRef.current.map((w) => (w.id === id ? { ...w, scope } : w))),
    [commitLayout],
  );

  const toggleCatalog = useCallback(() => setCatalogOpen((o) => !o), []);
  const closeCatalog = useCallback(() => setCatalogOpen(false), []);
  const closeSelection = useCallback(() => setSelection(null), []);
  const beginDrag = useCallback((id: string) => setDraggingId(id), []);
  /** Drag end: a final compact WITHOUT priority (reference parity); only changes the draft. */
  const endDrag = useCallback(() => {
    setDraggingId(null);
    const cur = layoutRef.current;
    const settled = compact(cur);
    if (JSON.stringify(settled) !== JSON.stringify(cur)) commitLayout(settled);
  }, [commitLayout]);

  useEffect(() => {
    // `history.replaceState` (not the router): Next syncs it into `useSearchParams` without a
    // navigation, and other query params (filters) stay as they are.
    const params = new URLSearchParams(window.location.search);
    for (const kind of URL_KINDS) params.delete(SELECTION_PARAMS[kind]);
    if (selection && selection.kind in SELECTION_PARAMS)
      params.set(SELECTION_PARAMS[selection.kind as keyof typeof SELECTION_PARAMS], selection.id);
    const qs = params.toString();
    if (`?${qs}` === window.location.search || (!qs && !window.location.search)) return;
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [selection]);

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
      else if (editing) leaveEditing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, catalogOpen, editing, leaveEditing]);

  return {
    layout,
    layoutRef,
    preset,
    saved,
    layouts,
    nextName,
    collapsed,
    epicClosed,
    editing,
    editTarget,
    catalogOpen: editing && catalogOpen,
    draggingId,
    selection,
    setSelection,
    closeSelection,
    applyPreset,
    startEditing,
    saveEdit,
    cancelEdit: leaveEditing,
    addLayout,
    deleteLayout,
    arrange,
    toggleCollapsed,
    setEpicClosed,
    move,
    resize,
    add,
    remove,
    configure,
    beginDrag,
    endDrag,
    toggleCatalog,
    closeCatalog,
  };
}

export type BridgeState = ReturnType<typeof useBridgeState>;
