/**
 * The one focus indicator the DS uses. Interactive components compose one of
 * these constants instead of re-typing the ring classes, so the focus style is
 * changed here and nowhere else.
 *
 * - `focusRing` — the default outer ring.
 * - `focusRingInset` — ring drawn inside the box, for flush/segmented controls
 *   (tabs, accordion summaries, menu items) where an outer ring would clip.
 * - `focusRingOffset` — ring lifted off the element with a surface-colored gap,
 *   for filled controls (buttons, drop zones) where the ring needs contrast.
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const focusRingInset =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export const focusRingOffset =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Shared look for natively-disabled (`disabled` attribute) controls. */
export const disabledClasses = "disabled:cursor-not-allowed disabled:opacity-50";
