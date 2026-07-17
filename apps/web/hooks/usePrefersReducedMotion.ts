"use client";

import { useState } from "react";

/**
 * Whether the operator asked the OS for reduced motion — read once at mount
 * (no subscription: the orb is remounted with the chat overlay often enough
 * that live-tracking the media query buys nothing, and a one-shot read keeps
 * the WebGL uniforms/frame-loop wiring branch-free after init).
 *
 * Guarded for environments without `matchMedia` (jsdom in component tests
 * exposes none) — those report `false`, matching the media query's own
 * "no preference" default.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
