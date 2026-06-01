import type { HTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";

/**
 * A compact mono tag. Tones cover context, status and the orchestration
 * model / thinking badges.
 */
const chip = cva(
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
        opus: "text-model-opus border-model-opus/35 bg-model-opus/10",
        sonnet: "text-model-sonnet border-model-sonnet/35 bg-model-sonnet/10",
        haiku: "text-model-haiku border-model-haiku/35 bg-model-haiku/10",
        "think-high": "text-think-high border-think-high/35 bg-think-high/10",
        "think-medium": "text-think-medium border-think-medium/35 bg-think-medium/10",
        "think-low": "text-think-low border-think-low/35 bg-think-low/10",
      },
      size: {
        sm: "px-2 py-0.5",
        md: "px-2.5 py-1.5",
      },
      solid: { true: "", false: "" },
    },
    compoundVariants: [
      { tone: "accent", solid: true, className: "bg-accent text-accent-contrast" },
      { tone: "ok", solid: true, className: "bg-ok text-background border-ok" },
      { tone: "warn", solid: true, className: "bg-warn text-background border-warn" },
      { tone: "bad", solid: true, className: "bg-bad text-background border-bad" },
    ],
    defaultVariants: { tone: "neutral", solid: false, size: "sm" },
  },
);

export enum ChipTestId {
  Root = "chip-root",
}

export interface ChipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "className">,
    VariantProps<typeof chip> {
  ref?: React.Ref<HTMLSpanElement>;
}

export function Chip({ tone, solid, size, children, ref, ...props }: ChipProps) {
  return (
    <span className={chip({ tone, solid, size })} data-testid={ChipTestId.Root} ref={ref} {...props}>
      {children}
    </span>
  );
}
