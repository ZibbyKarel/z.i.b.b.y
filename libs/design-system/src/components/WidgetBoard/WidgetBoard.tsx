"use client";

import { type ReactNode, type Ref, useEffect, useRef } from "react";

export enum WidgetBoardTestId {
  Root = "widget-board-root",
  /** The measured, `position: relative` surface the widgets are placed on. */
  Inner = "widget-board-inner",
}

export interface WidgetBoardProps {
  /** Edit mode draws faint column guides behind the widgets. */
  editing?: boolean;
  /** Column width in px (without gap) — used for the guides. */
  colWidth: number;
  /** Gap between columns in px. */
  gap: number;
  /** Height of the placement surface in px. */
  height: number;
  /** Reports the placement (pass a stable callback) surface's inner width (px) on mount and on every resize. */
  onMeasure?: (innerWidth: number) => void;
  /** Absolutely positioned widgets (see `WidgetFrame`). */
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A scrolling board that widgets are absolutely positioned on: `--color-bg` with a
 * 24px hairline grid, `var(--bridge-bp)` padding, it fills the available
 * width (and scrolls if content ever overflows). It measures its own
 * inner width so the caller can derive the column width. Sits in a flex column and
 * fills the remaining height.
 */
export function WidgetBoard({
  editing = false,
  colWidth,
  gap,
  height,
  onMeasure,
  children,
  ref,
}: WidgetBoardProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    onMeasure?.(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) onMeasure?.(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  const step = colWidth + gap;
  const guides = editing
    ? `repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-ink) 5%, transparent) 0 ${colWidth.toFixed(2)}px, transparent ${colWidth.toFixed(2)}px ${step.toFixed(2)}px)`
    : undefined;

  return (
    <div
      className="min-h-0 flex-1 overflow-auto bg-bg leading-[normal] p-[var(--bridge-bp)] [background-image:linear-gradient(var(--color-grid)_1px,transparent_1px),linear-gradient(90deg,var(--color-grid)_1px,transparent_1px)] [background-size:24px_24px]"
      data-testid={WidgetBoardTestId.Root}
      ref={ref}
    >
      <div
        className="relative w-full"
        data-testid={WidgetBoardTestId.Inner}
        ref={innerRef}
        style={{ height, backgroundImage: guides }}
      >
        {children}
      </div>
    </div>
  );
}
