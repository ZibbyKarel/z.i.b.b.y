import type { HTMLAttributes } from "react";
import { type AnyStateTone, type StateTone, normalizeToneLike } from "../../stateTone";
import { cn } from "../../utils/cn";
import { type Spacing, spacingToPx } from "../../tokens";

/**
 * The canonical {@link StateTone} palette (or the legacy vocabulary — see
 * {@link AnyStateTone}; `idle` is already canonical), plus one dot-only extra:
 * `wait` — the established "awaiting" call-site vocabulary for the same
 * amber/`blocked` shade (kept as its own name since callers read a dot as
 * "waiting", not "blocked" — see the health/status call sites). Non-live dots
 * are matte; glow + 2s opacity pulse appear only with `pulse` (running,
 * awaiting approval).
 */
export type DotTone = AnyStateTone | "wait";

// Keyed by the canonical `StateTone` (+ `wait`) — legacy classes reused where the
// color is identical (LEGACY_TONE_MAP). See `StatusDot()` for the resolve step.
const toneClass: Record<StateTone | "wait", string> = {
  thinking: "bg-accent",
  done: "bg-ok",
  blocked: "bg-warn",
  error: "bg-bad",
  working: "bg-run",
  idle: "bg-foreground-faint",
  wait: "bg-warn",
};

/** Live glow — only rendered when `pulse` is set. */
const glowClass: Record<StateTone | "wait", string> = {
  thinking: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-accent)_67%,transparent)]",
  done: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-ok)_67%,transparent)]",
  blocked: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-warn)_67%,transparent)]",
  error: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-bad)_67%,transparent)]",
  working: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-run)_67%,transparent)]",
  idle: "",
  wait: "shadow-[0_0_8px_color-mix(in_srgb,var(--color-warn)_67%,transparent)]",
};

/**
 * DS.md §7/§9 living behaviour: `working` breathes (`zb-live`/`animate-zb-live`),
 * `blocked` (and its `wait` alias) blinks (`zb-pulse`/`animate-zb-pulse`) — every
 * other tone is matte even when `pulse` is set ("the rest static"). Reuses the
 * same DS.md-named keyframes `StatePill`'s `StateDot` applies inline.
 */
const livingAnimationClass: Partial<Record<StateTone | "wait", string>> = {
  working: "animate-zb-live",
  blocked: "animate-zb-pulse",
  wait: "animate-zb-pulse",
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

/**
 * A status dot (DS.md §7) — a square pixel of the status colour, matte by
 * default. Living behaviour is tone-driven, not caller-chosen: `pulse` only
 * *permits* the dot to animate (an idle read-out of a past working/blocked
 * state should stay matte); `working` breathes, `blocked`/`wait` blink,
 * every other tone stays static regardless of `pulse`.
 */
export function StatusDot({ tone, size = "100", pulse = false, ref, ...props }: StatusDotProps) {
  const px = spacingToPx(size);
  const resolvedTone = normalizeToneLike(tone);
  const animationClass = pulse ? livingAnimationClass[resolvedTone] : undefined;
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
          "absolute inset-0",
          toneClass[resolvedTone],
          animationClass && glowClass[resolvedTone],
          animationClass && cn(animationClass, "motion-reduce:animate-none"),
        )}
        data-testid={StatusDotTestId.Dot}
      />
    </span>
  );
}
