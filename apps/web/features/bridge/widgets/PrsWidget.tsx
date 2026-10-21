"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

/** Placeholder — the real Prs widget body replaces this (see `BridgeWidgetProps`). */
export function PrsWidget({ onEmptyChange }: BridgeWidgetProps) {
  useEffect(() => onEmptyChange(true), [onEmptyChange]);
  return null;
}
