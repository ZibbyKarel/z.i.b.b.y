"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

/** Placeholder — the real Runs widget body replaces this (see `BridgeWidgetProps`). */
export function RunsWidget({ onEmptyChange }: BridgeWidgetProps) {
  useEffect(() => onEmptyChange(true), [onEmptyChange]);
  return null;
}
