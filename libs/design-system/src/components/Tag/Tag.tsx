import type { HTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { type AnyStateTone, type StateTone, normalizeToneLike } from "../../stateTone";
import { cn } from "../../utils/cn";
import { Icon, type IconName } from "../Icon/Icon";

/**
 * Risk categories — the design system's one categorical palette
 * ("color = state, shape = category"; everything else is glyph + text).
 */
export type RiskKind = "payment" | "deletion" | "push" | "send";

/** The canonical {@link StateTone} palette, plus `neutral` and the risk kinds — cva's
 *  `tone` variant, resolved from {@link TagTone} via `normalizeToneLike` (see `Tag()`). */
type CanonicalTagTone = StateTone | "neutral" | RiskKind;

/** {@link CanonicalTagTone}, plus the legacy vocabulary (see {@link AnyStateTone}) —
 *  the public prop type. */
export type TagTone = AnyStateTone | "neutral" | RiskKind;

// Keyed by the canonical `StateTone` (+ `neutral` + risk kinds) — legacy classes
// reused where the color is identical (LEGACY_TONE_MAP). See `Tag()` for the resolve
// step; cva matches `tone` against these keys directly, so the resolve must happen
// before `tag()` is called.
const toneClass: Record<CanonicalTagTone, string> = {
  neutral: "text-foreground-dim border-border bg-hover",
  thinking: "text-accent border-accent/35 bg-accent-dim",
  done: "text-ok border-ok/35 bg-ok/10",
  blocked: "text-warn border-warn/35 bg-warn/10",
  error: "text-bad border-bad/35 bg-bad/10",
  working: "text-run border-run/35 bg-run/10",
  idle: "text-state-idle border-state-idle/35 bg-state-idle/10",
  payment: "text-risk-payment border-risk-payment/25 bg-risk-payment/[0.08]",
  deletion: "text-risk-deletion border-risk-deletion/25 bg-risk-deletion/[0.08]",
  push: "text-risk-push border-risk-push/25 bg-risk-push/[0.08]",
  send: "text-risk-send border-risk-send/25 bg-risk-send/[0.08]",
};

const tag = cva(
  "inline-flex items-center gap-1 font-mono text-xs font-semibold " +
    "rounded-sm border whitespace-nowrap tracking-wide",
  {
    variants: {
      tone: toneClass,
      size: {
        sm: "px-2 py-0.5",
        md: "px-2.5 py-1.5",
      },
      solid: { true: "", false: "" },
      uppercase: { true: "uppercase", false: "" },
    },
    compoundVariants: [
      {
        tone: "neutral",
        solid: true,
        className: "bg-foreground-dim text-background border-transparent",
      },
      {
        tone: "thinking",
        solid: true,
        className: "bg-accent text-accent-contrast border-transparent",
      },
      { tone: "done", solid: true, className: "bg-ok text-background border-transparent" },
      { tone: "blocked", solid: true, className: "bg-warn text-background border-transparent" },
      { tone: "error", solid: true, className: "bg-bad text-background border-transparent" },
      { tone: "working", solid: true, className: "bg-run text-background border-transparent" },
    ],
    defaultVariants: { tone: "neutral", solid: false, size: "sm" },
  },
);

/** Default glyph for each risk category — the canonical risk → icon mapping. */
export const riskIcon: Record<RiskKind, IconName> = {
  payment: "dollar",
  deletion: "trash",
  push: "branch",
  send: "arrow",
};

export enum TagTestId {
  Root = "tag-root",
  Icon = "tag-icon",
}

export interface TagProps
  extends
    Omit<HTMLAttributes<HTMLSpanElement>, "className">,
    Omit<VariantProps<typeof tag>, "tone"> {
  /** Toned emphasis — accepts both the canonical and the legacy vocabulary (see
   *  {@link AnyStateTone}), plus `neutral` and the risk kinds; resolved via
   *  `normalizeToneLike` before it reaches cva. */
  tone?: TagTone;
  /** Optional leading glyph (categorical marker — risk kind, channel, …). */
  icon?: IconName;
  ref?: React.Ref<HTMLSpanElement>;
}

/**
 * Angular label badge — a glyph + text tinted by `tone`. The "shape = category"
 * half of the badge family (the rounded {@link Chip} is the "color = state"
 * half). Toned by default; `solid` fills it. `uppercase` renders the label in
 * caps (the run-state chip's "BĚŽÍ"/"HOTOVO" look) without transforming the
 * underlying text — only the CSS presentation changes.
 */
export function Tag({ tone, solid, size, uppercase, icon, children, ref, ...props }: TagProps) {
  const resolvedTone = tone ? normalizeToneLike(tone) : undefined;
  return (
    <span
      className={cn(tag({ tone: resolvedTone, solid, size, uppercase }))}
      data-testid={TagTestId.Root}
      ref={ref}
      {...props}
    >
      {icon && <Icon data-testid={TagTestId.Icon} name={icon} size="xs" />}
      {children}
    </span>
  );
}
