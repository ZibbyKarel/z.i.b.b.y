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

export interface ProgressProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "className"
> {
  /** Fill percentage, 0–100. */
  value: number;
  tone?: ProgressTone;
  /** Track height as a spacing token. */
  height?: Spacing;
  /** @deprecated Bars are matte — glow is reserved for live states. Ignored. */
  glow?: boolean;
  /** Accessible label; renders an ARIA progressbar when provided. */
  label?: string;
  ref?: React.Ref<HTMLDivElement>;
}

/** A thin matte progress bar — the dashboard's quota/usage readout. */
export function Progress({
  value,
  tone = "accent",
  height = "50",
  glow,
  label,
  ref,
  ...props
}: ProgressProps) {
  void glow; // deprecated and ignored — bars are matte, glow belongs to live states
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={label ? 100 : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuenow={label ? pct : undefined}
      className="relative overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]"
      data-testid={ProgressTestId.Root}
      ref={ref}
      role={label ? "progressbar" : undefined}
      style={{ height: spacingToPx(height) }}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
          toneBar[tone],
        )}
        data-testid={ProgressTestId.Fill}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Maps a usage percentage to a traffic-light tone. */
export function getUsageTone(pct: number): ProgressTone {
  if (pct >= 85) return "bad";
  if (pct >= 60) return "warn";
  return "ok";
}
