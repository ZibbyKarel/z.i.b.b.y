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
  /** Header note when nothing needs the operator and there is something listed (`ALL CLEAR`). */
  clearAside?: string | undefined;
}

/** Feeds the frame: emptiness (never while loading) and the count / YOU / aside header info. */
export function useWidgetReport(
  { loading, count, you, clearAside }: Report,
  { onEmptyChange, onCountChange }: Pick<BridgeWidgetProps, "onEmptyChange" | "onCountChange">,
) {
  const empty = !loading && !count;
  useEffect(() => onEmptyChange(empty), [empty, onEmptyChange]);
  const aside = count && !you ? clearAside : undefined;
  useEffect(() => onCountChange?.({ count, you, aside }), [count, you, aside, onCountChange]);
}
