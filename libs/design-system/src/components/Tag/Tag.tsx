import type { HTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { Icon, type IconName } from "../Icon/Icon";

const tag = cva(
  "inline-flex items-center gap-1 font-mono text-xs font-semibold " +
    "rounded-sm border whitespace-nowrap tracking-wide",
  {
    variants: {
      tone: {
        neutral: "text-foreground-dim border-border bg-[rgba(255,255,255,0.04)]",
        accent: "text-accent border-accent/35 bg-accent-dim",
        ok: "text-ok border-ok/35 bg-ok/10",
        warn: "text-warn border-warn/35 bg-warn/10",
        bad: "text-bad border-bad/35 bg-bad/10",
        run: "text-run border-run/35 bg-run/10",
        payment: "text-risk-payment border-risk-payment/25 bg-risk-payment/[0.08]",
        deletion: "text-risk-deletion border-risk-deletion/25 bg-risk-deletion/[0.08]",
        push: "text-risk-push border-risk-push/25 bg-risk-push/[0.08]",
        send: "text-risk-send border-risk-send/25 bg-risk-send/[0.08]",
      },
      size: {
        sm: "px-2 py-0.5",
        md: "px-2.5 py-1.5",
      },
      solid: { true: "", false: "" },
    },
    compoundVariants: [
      { tone: "neutral", solid: true, className: "bg-foreground-dim text-background border-transparent" },
      { tone: "accent", solid: true, className: "bg-accent text-accent-contrast border-transparent" },
      { tone: "ok", solid: true, className: "bg-ok text-background border-transparent" },
      { tone: "warn", solid: true, className: "bg-warn text-background border-transparent" },
      { tone: "bad", solid: true, className: "bg-bad text-background border-transparent" },
      { tone: "run", solid: true, className: "bg-run text-background border-transparent" },
    ],
    defaultVariants: { tone: "neutral", solid: false, size: "sm" },
  },
);

export type TagTone = NonNullable<VariantProps<typeof tag>["tone"]>;

/**
 * Risk categories — the design system's one categorical palette
 * ("color = state, shape = category"; everything else is glyph + text).
 */
export type RiskKind = "payment" | "deletion" | "push" | "send";

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
  extends Omit<HTMLAttributes<HTMLSpanElement>, "className">,
    VariantProps<typeof tag> {
  /** Optional leading glyph (categorical marker — risk kind, channel, …). */
  icon?: IconName;
  ref?: React.Ref<HTMLSpanElement>;
}

/**
 * Angular label badge — a glyph + text tinted by `tone`. The "shape = category"
 * half of the badge family (the rounded {@link Chip} is the "color = state"
 * half). Toned by default; `solid` fills it.
 */
export function Tag({ tone, solid, size, icon, children, ref, ...props }: TagProps) {
  return (
    <span
      className={cn(tag({ tone, solid, size }))}
      data-testid={TagTestId.Root}
      ref={ref}
      {...props}
    >
      {icon && <Icon data-testid={TagTestId.Icon} name={icon} size="xs" />}
      {children}
    </span>
  );
}
