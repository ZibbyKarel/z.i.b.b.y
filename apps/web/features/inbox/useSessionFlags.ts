"use client";

import { useState } from "react";

function read(key: string): Record<string, boolean> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Boolean flags by id, remembered for the browser session under `key` (epic
 * expansion on Issues, collapsed sections on Pull requests). Storage unavailable
 * or corrupt → starts empty and simply isn't remembered.
 */
export function useSessionFlags(key: string) {
  const [flags, setFlags] = useState<Record<string, boolean>>(() => read(key));
  const set = (id: string, value: boolean) => {
    const updated = { ...flags, [id]: value };
    setFlags(updated);
    try {
      window.sessionStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Session storage unavailable: the flag simply isn't remembered.
    }
  };
  return [flags, set] as const;
}
