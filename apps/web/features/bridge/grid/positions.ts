import { type BridgeWidget, COLS } from "./layout";

export interface WidgetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function colWidth(boardInnerWidth: number, gap: number): number {
  return (boardInnerWidth - gap * (COLS - 1)) / COLS;
}

export function widgetRect(
  w: Pick<BridgeWidget, "x" | "y" | "w" | "h">,
  colW: number,
  gap: number,
  rowH: number,
): WidgetRect {
  return {
    left: w.x * (colW + gap),
    top: w.y * (rowH + gap),
    width: w.w * colW + (w.w - 1) * gap,
    height: w.h * rowH + (w.h - 1) * gap,
  };
}

/** `extraRows` = edit-mode slack (reference adds 2 rows). */
export function boardHeight(
  layout: readonly BridgeWidget[],
  rowH: number,
  gap: number,
  extraRows = 0,
): number {
  const maxY = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  return Math.max(0, maxY * (rowH + gap) - gap) + extraRows * (rowH + gap);
}
