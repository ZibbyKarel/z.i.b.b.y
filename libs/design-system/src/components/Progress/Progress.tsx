import type { HTMLAttributes } from "react";
import { type Spacing, spacingToPx } from "../../tokens";
import { cn } from "../../utils/cn";

export type ProgressTone = "accent" | "ok" | "warn" | "bad" | "run";

export enum ProgressTestId {
  Root = "progress-root",
  Fill = "progress-fill",
}

const toneBar: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  run: "bg-run",
};

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  /** Fill percentage, 0–100. Ignored when `indeterminate`. */
  value?: number;
  /** Ignored when `indeterminate` — that fill is always the ZibbyCorp ink bar. */
  tone?: ProgressTone;
  /** Track height as a spacing token. */
  height?: Spacing;
  /** Accessible label; renders an ARIA progressbar when provided. */
  label?: string;
  /** Unknown-duration loading: a sliding ink segment instead of a `value` fill
   *  (DS.md §1.2/§6 — no glow, no blur). Static (full width) under
   *  `prefers-reduced-motion`. */
  indeterminate?: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/** A thin matte progress bar — the dashboard's quota/usage readout, and (with
 *  `indeterminate`) the ZibbyCorp loading indicator for unknown-duration waits. */
export function Progress({
  value = 0,
  tone = "accent",
  height = "75",
  label,
  indeterminate = false,
  ref,
  ...props
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={label && !indeterminate ? 100 : undefined}
      aria-valuemin={label && !indeterminate ? 0 : undefined}
      aria-valuenow={label && !indeterminate ? pct : undefined}
      className="relative overflow-hidden rounded-none bg-border"
      data-testid={ProgressTestId.Root}
      ref={ref}
      role={label ? "progressbar" : undefined}
      style={{ height: spacingToPx(height) }}
      {...props}
    >
      {indeterminate ? (
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1/3 rounded-none bg-ink",
            "animate-progress-indeterminate motion-reduce:w-full motion-reduce:animate-none",
          )}
          data-testid={ProgressTestId.Fill}
        />
      ) : (
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-none transition-[width] duration-300",
            toneBar[tone],
          )}
          data-testid={ProgressTestId.Fill}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

/** Maps a usage percentage to a traffic-light tone. */
export function getUsageTone(pct: number): ProgressTone {
  if (pct >= 85) return "bad";
  if (pct >= 60) return "warn";
  return "ok";
}
