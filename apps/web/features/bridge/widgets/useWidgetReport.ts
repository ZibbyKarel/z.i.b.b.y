"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

interface Report {
  /** Still fetching — never reported as empty (avoids collapse/expand flicker). */
  loading: boolean;
  /** Item count; `undefined` while loading (header shows no count). */
  count: number | undefined;
  /** Items needing the operator. */
  you: number;
  /** Right-aligned header note. */
  aside?: string;
  /** Header sync button — `onRefresh` must be stable. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** The fetch failed — an error state is shown, so the widget must not collapse as empty. */
  failed?: boolean;
  /** A filter pick is applied — the header filters button shows its marker. */
  filtersActive?: boolean;
}

/** Feeds the frame: emptiness (never while loading) and the count / YOU / aside header info. */
export function useWidgetReport(
  { loading, count, you, aside, onRefresh, refreshing, failed, filtersActive }: Report,
  { onEmptyChange, onCountChange }: Pick<BridgeWidgetProps, "onEmptyChange" | "onCountChange">,
) {
  const empty = !loading && !count && !failed;
  useEffect(() => onEmptyChange(empty), [empty, onEmptyChange]);
  useEffect(
    () => onCountChange?.({ count, you, loading, aside, onRefresh, refreshing, filtersActive }),
    [count, you, loading, aside, onRefresh, refreshing, filtersActive, onCountChange],
  );
}
