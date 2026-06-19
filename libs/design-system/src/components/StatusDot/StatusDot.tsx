import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { type Spacing, spacingToPx } from "../../tokens";

/**
 * Canonical states: ok / run / wait / bad / idle ("color = state"), plus
 * accent for interaction/selection markers. Non-live dots are matte; glow +
 * 2s opacity pulse appear only with `pulse` (running, awaiting approval).
 */
export type DotTone = "ok" | "run" | "wait" | "bad" | "idle" | "accent";

const toneClass: Record<DotTone, string> = {
  ok: "bg-ok",
  run: "bg-run",
  wait: "bg-warn",
  bad: "bg-bad",
  idle: "bg-foreground-faint",
  accent: "bg-accent",
};

/** Live glow — only rendered when `pulse` is set. */
const glowClass: Record<DotTone, string> = {
  ok: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-ok)_67%,transparent)]",
  run: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-run)_67%,transparent)]",
  wait: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-warn)_67%,transparent)]",
  bad: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-bad)_67%,transparent)]",
  idle: "",
  accent: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-accent)_67%,transparent)]",
};

export enum StatusDotTestId {
  Root = "status-dot-root",
  Dot = "status-dot-dot",
}

export interface StatusDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone: DotTone;
  /** Diameter as a spacing token. */
  size?: Spacing;
  /** Live state — adds the glow and the 2s opacity pulse. */
  pulse?: boolean;
  ref?: React.Ref<HTMLSpanElement>;
}

/** A status dot — matte by default, glowing and pulsing only when live. */
export function StatusDot({ tone, size = "100", pulse = false, ref, ...props }: StatusDotProps) {
  const px = spacingToPx(size);
  return (
    <span
      className="relative inline-block shrink-0"
      data-testid={StatusDotTestId.Root}
      ref={ref}
      style={{ width: px, height: px }}
      {...props}
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          toneClass[tone],
          pulse && glowClass[tone],
          pulse && "animate-live motion-reduce:animate-none",
        )}
        data-testid={StatusDotTestId.Dot}
      />
    </span>
  );
}
