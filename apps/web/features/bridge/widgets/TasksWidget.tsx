"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

/** Placeholder — the real Tasks widget body replaces this (see `BridgeWidgetProps`). */
export function TasksWidget({ onEmptyChange }: BridgeWidgetProps) {
  useEffect(() => onEmptyChange(true), [onEmptyChange]);
  return null;
}
