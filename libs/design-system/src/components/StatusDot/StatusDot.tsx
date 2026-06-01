import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type DotTone =
  | "accent"
  | "ok"
  | "warn"
  | "bad"
  | "run"
  | "home"
  | "work"
  | "faint";

const toneClass: Record<DotTone, string> = {
  accent: "bg-accent shadow-[0_0_7px_var(--zb-accent-glow)]",
  ok: "bg-ok shadow-[0_0_7px_#39d98a]",
  warn: "bg-warn shadow-[0_0_7px_#f0b429]",
  bad: "bg-bad shadow-[0_0_7px_#ff6b6b]",
  run: "bg-run shadow-[0_0_7px_#5b8def]",
  home: "bg-home shadow-[0_0_7px_#f0b429]",
  work: "bg-work shadow-[0_0_7px_#5b8def]",
  faint: "bg-foreground-faint",
};

const ringClass: Record<DotTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  run: "bg-run",
  home: "bg-home",
  work: "bg-work",
  faint: "bg-foreground-faint",
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone: DotTone;
  /** Diameter in px. */
  size?: number;
  /** Emit an expanding pulse ring (for live/running states). */
  pulse?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}

/** A glowing status dot, optionally pulsing. */
export function StatusDot({
  tone,
  size = 8,
  pulse = false,
  className,
  ref,
  ...props
}: StatusDotProps) {
  return (
    <span
      ref={ref}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      {pulse && (
        <span
          className={cn(
            "absolute -inset-1 rounded-full opacity-35 animate-zpulse",
            ringClass[tone],
          )}
        />
      )}
      <span className={cn("absolute inset-0 rounded-full", toneClass[tone])} />
    </span>
  );
}
