"use client";

import { useEffect } from "react";
import type { BridgeWidgetProps } from "./registry";

/** Placeholder — the real Briefing widget body replaces this (see `BridgeWidgetProps`). */
export function BriefingWidget({ onEmptyChange }: BridgeWidgetProps) {
  useEffect(() => onEmptyChange(true), [onEmptyChange]);
  return null;
}
