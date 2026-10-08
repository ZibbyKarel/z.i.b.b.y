"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Layout effect on the client so the stored panel paints without a collapsed flash.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const DOCK_STORAGE_KEY = "zibby.dock.active";

/**
 * The activity dock's open panel id (`null` = collapsed), remembered per browser.
 * SSR-safe: starts `null` and hydrates from storage in an effect. Blocked storage
 * just means "collapsed, not remembered".
 */
export function useDockState(): [string | null, (id: string | null) => void] {
  const [active, setActive] = useState<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(DOCK_STORAGE_KEY);
      if (stored) setActive(stored);
    } catch {
      // storage blocked — stay collapsed
    }
  }, []);

  const update = useCallback((id: string | null) => {
    setActive(id);
    try {
      if (id) window.localStorage.setItem(DOCK_STORAGE_KEY, id);
      else window.localStorage.removeItem(DOCK_STORAGE_KEY);
    } catch {
      // storage blocked — not remembered
    }
  }, []);

  return [active, update];
}
