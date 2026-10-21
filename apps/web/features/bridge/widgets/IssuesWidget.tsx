"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

/** Placeholder — the real Issues widget body replaces this (see `BridgeWidgetProps`). */
export function IssuesWidget({ onEmptyChange }: BridgeWidgetProps) {
  useEffect(() => onEmptyChange(true), [onEmptyChange]);
  return null;
}
