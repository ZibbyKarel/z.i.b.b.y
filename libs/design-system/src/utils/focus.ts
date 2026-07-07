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
export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const focusRingInset =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export const focusRingOffset =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * Shared look for natively-disabled (`disabled` attribute) controls.
 *
 * A disabled control must read UNAMBIGUOUSLY as disabled — not merely a faded
 * version of its active intent. Opacity alone leaves a filled/accent button
 * looking active-but-dimmed, so the `disabled:` state overrides the intent's
 * fill, text and border with neutral, inert tokens (a muted raised surface +
 * faint text + hairline border). This is intent-agnostic: primary, ghost and
 * danger all land on the same clear disabled look. The `disabled:` variants
 * out-specify the plain intent classes, so they win regardless of order.
 */
export const disabledClasses =
  "disabled:cursor-not-allowed disabled:bg-elevated " +
  "disabled:text-foreground-faint disabled:border-border";
