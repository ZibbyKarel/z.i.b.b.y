"use client";

import { useState } from "react";

function read<V>(key: string): Record<string, V> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, V>) : {};
  } catch {
    return {};
  }
}

/**
 * Values by id, remembered for the browser session under `key` (epic expansion on Issues, the
 * review mode per PR). Every write merges into what storage holds now, so several hook
 * instances on one key never drop each other's ids. Storage unavailable or corrupt → starts
 * empty and simply isn't remembered.
 */
export function useSessionFlags<V = boolean>(key: string) {
  const [flags, setFlags] = useState<Record<string, V>>(() => read<V>(key));
  const set = (id: string, value: V) => {
    const updated = { ...read<V>(key), [id]: value };
    setFlags(updated);
    try {
      window.sessionStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Session storage unavailable: the value simply isn't remembered.
    }
  };
  return [flags, set] as const;
}
