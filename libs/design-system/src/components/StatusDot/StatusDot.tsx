import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { type Spacing, spacingToPx } from "../../tokens";

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
  accent: "bg-accent shadow-[0_0_7px_var(--color-accent-glow)]",
  ok: "bg-ok shadow-[0_0_7px_var(--color-ok-glow)]",
  warn: "bg-warn shadow-[0_0_7px_var(--color-warn-glow)]",
  bad: "bg-bad shadow-[0_0_7px_var(--color-bad-glow)]",
  run: "bg-work shadow-[0_0_7px_var(--color-work-glow)]",
  home: "bg-home shadow-[0_0_7px_var(--color-home-glow)]",
  work: "bg-work shadow-[0_0_7px_var(--color-work-glow)]",
  faint: "bg-foreground-faint",
};

const ringClass: Record<DotTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  run: "bg-work",
  home: "bg-home",
  work: "bg-work",
  faint: "bg-foreground-faint",
};

export enum StatusDotTestId {
  Root = "status-dot-root",
  Pulse = "status-dot-pulse",
  Dot = "status-dot-dot",
}

export interface StatusDotProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "className"
> {
  tone: DotTone;
  /** Diameter as a spacing token. */
  size?: Spacing;
  /** Emit an expanding pulse ring (for live/running states). */
  pulse?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}

/** A glowing status dot, optionally pulsing. */
export function StatusDot({
  tone,
  size = "100",
  pulse = false,
  ref,
  ...props
}: StatusDotProps) {
  const px = spacingToPx(size);
  return (
    <span
      className="relative inline-block shrink-0"
      data-testid={StatusDotTestId.Root}
      ref={ref}
      style={{ width: px, height: px }}
      {...props}
    >
      {pulse && (
        <span
          className={cn(
            "absolute -inset-1 rounded-full opacity-35 animate-zpulse",
            ringClass[tone],
          )}
          data-testid={StatusDotTestId.Pulse}
        />
      )}
      <span className={cn("absolute inset-0 rounded-full", toneClass[tone])} data-testid={StatusDotTestId.Dot} />
    </span>
  );
}
