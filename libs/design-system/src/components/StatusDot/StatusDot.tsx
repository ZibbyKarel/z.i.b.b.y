import type { HTMLAttributes } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";
import { type Spacing, spacingToPx } from "../../tokens";

/**
 * The canonical {@link StateTone} palette ("color = state"), plus two dot-only
 * extras: `wait` — the established "awaiting" call-site vocabulary for the same
 * amber/`warn` shade (kept as its own name since callers read a dot as
 * "waiting", not "warning" — see the health/status call sites) — and `idle`
 * (no activity, matte grey, no `StateTone` equivalent). Non-live dots are
 * matte; glow + 2s opacity pulse appear only with `pulse` (running, awaiting
 * approval).
 */
export type DotTone = StateTone | "wait" | "idle";

const toneClass: Record<DotTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  run: "bg-run",
  wait: "bg-warn",
  idle: "bg-foreground-faint",
};

/** Live glow — only rendered when `pulse` is set. */
const glowClass: Record<DotTone, string> = {
  accent: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-accent)_67%,transparent)]",
  ok: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-ok)_67%,transparent)]",
  warn: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-warn)_67%,transparent)]",
  bad: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-bad)_67%,transparent)]",
  run: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-run)_67%,transparent)]",
  wait: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-warn)_67%,transparent)]",
  idle: "",
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
