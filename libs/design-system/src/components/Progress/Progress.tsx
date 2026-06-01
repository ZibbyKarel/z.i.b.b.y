import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { spacingToPx, type Spacing } from "../../tokens";

export type ProgressTone = "accent" | "ok" | "warn" | "bad";

export enum ProgressTestId {
  Root = "progress-root",
  Fill = "progress-fill",
}

const toneBar: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

const toneGlow: Record<ProgressTone, string> = {
  accent: "shadow-[0_0_10px_var(--color-accent-glow)]",
  ok: "shadow-[0_0_10px_rgba(57,217,138,0.53)]",
  warn: "shadow-[0_0_10px_rgba(240,180,41,0.53)]",
  bad: "shadow-[0_0_10px_rgba(255,107,107,0.53)]",
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
  glow?: boolean;
  /** Accessible label; renders an ARIA progressbar when provided. */
  label?: string;
  ref?: React.Ref<HTMLDivElement>;
}

/** A thin progress bar — the dashboard's quota/usage readout. */
export function Progress({
  value,
  tone = "accent",
  height = "75",
  glow = false,
  label,
  ref,
  ...props
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      ref={ref}
      data-testid={ProgressTestId.Root}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={label ? pct : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className="relative overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]"
      style={{ height: spacingToPx(height) }}
      {...props}
    >
      <div
        data-testid={ProgressTestId.Fill}
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-300",
          toneBar[tone],
          glow && toneGlow[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Maps a usage percentage to a traffic-light tone. */
export function usageTone(pct: number): ProgressTone {
  if (pct >= 85) return "bad";
  if (pct >= 60) return "warn";
  return "ok";
}
