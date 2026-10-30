"use client";

import { useSyncExternalStore } from "react";

/** Below the DS `md` breakpoint (768px) — the phone layout. */
const PHONE_QUERY = "(max-width: 767.98px)";

const mql = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(PHONE_QUERY)
    : null;

const subscribe = (onChange: () => void) => {
  const m = mql();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
};

/**
 * Whether the viewport is phone-sized, live (rotating or resizing re-renders).
 * Server render and environments without `matchMedia` (jsdom) report `false` —
 * the desktop layout.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql()?.matches ?? false,
    () => false,
  );
}
