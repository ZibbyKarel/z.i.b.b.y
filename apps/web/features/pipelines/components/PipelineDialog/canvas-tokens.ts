/**
 * Colour helpers for the pipeline canvas — the app's one data-viz surface, where
 * dynamic node/edge styling can't be expressed as static Tailwind classes. Values
 * resolve to DS theme CSS vars so the canvas tracks the theme; alpha tints use
 * `color-mix` rather than hard-coded rgba.
 */
export const ACCENT = "var(--color-accent)";
export const BAD = "var(--color-bad)";
export const SURFACE = "var(--color-surface)";
export const SURFACE_HI = "var(--color-elevated)";
export const BG0 = "var(--color-background-deep)";
export const LINE = "var(--color-border)";

/** Mix a theme colour with transparency (e.g. `mix(ACCENT, 33)` ≈ accent @ 33%). */
export const mix = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;
