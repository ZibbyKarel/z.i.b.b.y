import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export interface MeasuredSize {
  w: number;
  h: number;
}

/** Fallback size used until a real measurement lands (and forever, if it never does). */
const DEFAULT_SIZE: MeasuredSize = { w: 1200, h: 720 };

/**
 * Measures a container element's content box via `ResizeObserver`. Reads once
 * synchronously on mount with `getBoundingClientRect` — some hosts (e.g. headless
 * screenshot capture) never deliver the first `ResizeObserver` callback, so without the
 * synchronous read the caller would be stuck on the default size forever. Falls back to
 * the default `1200x720` and skips the observer subscription entirely when
 * `ResizeObserver` doesn't exist (jsdom without a polyfill) — this hook must never throw
 * in a test environment lacking the global.
 *
 * Ported from `useMeasure` in the original orb-map prototype
 * (`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`).
 */
export function useMeasure(): [RefObject<HTMLDivElement | null>, MeasuredSize] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<MeasuredSize>(DEFAULT_SIZE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const r0 = el.getBoundingClientRect();
    if (r0.width && r0.height) setSize({ w: r0.width, h: r0.height });

    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
}
