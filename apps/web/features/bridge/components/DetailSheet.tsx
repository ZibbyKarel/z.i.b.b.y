"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type SheetAnchor, anchorChanged, measureSheet } from "../state/measure";
import { findRow, useRowKeyNav } from "../state/useRowKeyNav";
import type { BridgeSelection } from "../widgets/registry";
import { IssueSheet } from "./sheets/IssueSheet";
import { PrSheet } from "./sheets/PrSheet";
import { TaskSheet } from "./sheets/TaskSheet";

export enum DetailSheetTestId {
  Host = "bridge-detail-sheet-host",
}

export interface DetailSheetProps {
  selection: BridgeSelection | null;
  onClose: () => void;
  /** Reports the side the sheet opened to (the open row drops its ink rule on that edge). */
  onSideChange?: (side: "left" | "right") => void;
}

/**
 * The detail sheet layer. Mount it inside the `relative` wrapper that sits over the board: the
 * wrapper is both the screen root and the board for `measureSheet`, so the sheet spans the board's
 * full height. It anchors next to the open row (`[data-rk="<key>"]`), re-measuring when the
 * wrapper resizes, when any widget body scrolls, and on window resize. J/K step through the rows
 * of the row's widget.
 */
export function DetailSheet({ selection, onClose, onSideChange }: DetailSheetProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<SheetAnchor | null>(null);
  const last = useRef<SheetAnchor | null>(null);
  const key = selection?.key;
  const side = anchor?.side;

  useRowKeyNav(selection, root);

  useEffect(() => {
    if (side) onSideChange?.(side === "l" ? "left" : "right");
  }, [side, onSideChange]);

  useLayoutEffect(() => {
    const host = marker.current?.parentElement ?? null;
    root.current = host;
    if (!key || !host) {
      last.current = null;
      setAnchor(null);
      return;
    }
    const measure = () => {
      const row = findRow(host, key);
      if (!row) return;
      const rect = host.getBoundingClientRect();
      const next = measureSheet(rect, row.getBoundingClientRect(), rect);
      if (!anchorChanged(next, last.current)) return; // observers fire often — only real moves set state
      last.current = next;
      setAnchor(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    // Rows move when a list changes under an open sheet (no resize, no scroll).
    const mo = new MutationObserver(measure);
    mo.observe(host, { childList: true, subtree: true });
    // Scroll doesn't bubble: capture it to catch every widget body.
    host.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      host.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [key]);

  const kind = selection && anchor ? selection.kind : null;
  const common = selection && anchor ? { id: selection.id, anchor, onClose } : null;
  return (
    <>
      <span hidden data-testid={DetailSheetTestId.Host} ref={marker} />
      {common && kind === "issue" ? <IssueSheet {...common} /> : null}
      {common && kind === "task" ? <TaskSheet {...common} /> : null}
      {common && kind === "pr" ? <PrSheet {...common} /> : null}
    </>
  );
}
