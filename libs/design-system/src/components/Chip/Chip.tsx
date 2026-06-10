import type { HTMLAttributes } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../../utils/cn";

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
        run: "text-work border-work/35 bg-work/10",
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
      { tone: "neutral", solid: true, className: "bg-foreground-dim text-background border-transparent" },
      { tone: "accent", solid: true, className: "bg-accent text-accent-contrast border-transparent" },
      { tone: "ok", solid: true, className: "bg-ok text-background border-transparent" },
      { tone: "warn", solid: true, className: "bg-warn text-background border-transparent" },
      { tone: "bad", solid: true, className: "bg-bad text-background border-transparent" },
      { tone: "run", solid: true, className: "bg-work text-background border-transparent" },
      { tone: "opus", solid: true, className: "bg-model-opus text-background border-transparent" },
      { tone: "sonnet", solid: true, className: "bg-model-sonnet text-background border-transparent" },
      { tone: "haiku", solid: true, className: "bg-model-haiku text-background border-transparent" },
      { tone: "think-high", solid: true, className: "bg-think-high text-background border-transparent" },
      { tone: "think-medium", solid: true, className: "bg-think-medium text-background border-transparent" },
      { tone: "think-low", solid: true, className: "bg-think-low text-background border-transparent" },
    ],
    defaultVariants: { tone: "neutral", solid: false, size: "sm" },
  },
);

export type ChipTone = NonNullable<VariantProps<typeof chip>["tone"]>;

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
    <span className={cn(chip({ tone, solid, size }))} data-testid={ChipTestId.Root} ref={ref} {...props}>
      {children}
    </span>
  );
}
