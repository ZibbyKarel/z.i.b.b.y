"use client";

import { WidgetFrameTestId } from "@zibby/design-system";
import { type RefObject, useEffect } from "react";
import type { BridgeSelection } from "../widgets/registry";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

/** The row element carrying `data-rk={key}` (attribute compare — keys may hold any character). */
export const findRow = (root: ParentNode, key: string) =>
  [...root.querySelectorAll<HTMLElement>("[data-rk]")].find((el) => el.dataset.rk === key) ?? null;

/**
 * J / ArrowDown → next row, K / ArrowUp → previous row, within the selected row's widget.
 * Rows are the `[data-rk]` elements inside the widget frame (DOM order); the neighbour is
 * opened by clicking it — a row's click is what opens the sheet, so selection stays the
 * widgets' business. Ignored while typing and at the ends (no wrap).
 * ponytail: DOM order = visual order; a widget that reorders rows with CSS only would break it.
 */
export function useRowKeyNav(
  selection: BridgeSelection | null,
  root: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const d =
        e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      const cur = root.current ? findRow(root.current, selection.key) : null;
      const frame = cur?.closest(`[data-testid="${WidgetFrameTestId.Root}"]`);
      if (!cur || !frame) return;
      const rows = [...frame.querySelectorAll<HTMLElement>("[data-rk]")];
      const next = rows[rows.indexOf(cur) + d];
      if (!next) return;
      e.preventDefault();
      next.scrollIntoView?.({ block: "nearest" });
      next.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, root]);
}
