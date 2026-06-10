"use client";

import { useEffect, useState } from "react";

/**
 * Current epoch ms, re-read every `intervalMs` — for relative timestamps and
 * countdowns that must stay fresh between (slower) data polls. Keeping
 * `Date.now()` in a lazy initializer + interval, rather than calling it inline
 * in render, satisfies the React purity rule.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
