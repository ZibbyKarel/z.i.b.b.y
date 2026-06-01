import type { HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "ok"
  | "warn"
  | "bad"
  | "run"
  | "opus"
  | "sonnet"
  | "haiku";

export enum BadgeTestId {
  Root = "badge-root",
}

export interface BadgeProps extends Omit<
  HTMLAttributes<HTMLSpanElement>,
  "className"
> {
  tone?: BadgeTone;
  solid?: boolean;
  size?: "sm" | "md";
  ref?: Ref<HTMLSpanElement>;
}

const toneBase: Record<BadgeTone, string> = {
  neutral: "text-foreground-dim bg-elevated border-border",
  accent: "text-accent bg-accent-dim border-accent/40",
  ok: "text-ok bg-ok/12 border-ok/25",
  warn: "text-warn bg-warn/12 border-warn/25",
  bad: "text-bad bg-bad/12 border-bad/25",
  run: "text-work bg-work/12 border-work/25",
  opus: "text-model-opus bg-model-opus/12 border-model-opus/25",
  sonnet: "text-model-sonnet bg-model-sonnet/12 border-model-sonnet/25",
  haiku: "text-model-haiku bg-model-haiku/12 border-model-haiku/25",
};

const toneSolid: Record<BadgeTone, string> = {
  neutral: "bg-foreground-dim border-transparent text-background",
  accent: "bg-accent border-transparent text-accent-contrast",
  ok: "bg-ok border-transparent text-background",
  warn: "bg-warn border-transparent text-background",
  bad: "bg-bad border-transparent text-background",
  run: "bg-work border-transparent text-background",
  opus: "bg-model-opus border-transparent text-background",
  sonnet: "bg-model-sonnet border-transparent text-background",
  haiku: "bg-model-haiku border-transparent text-background",
};

const sizeClasses: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "text-sm rounded-sm px-1.5 py-px",
  md: "text-caption rounded-sm px-2 py-0.5",
};

export function Badge({
  tone = "neutral",
  solid = false,
  size = "sm",
  ref,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      data-testid={BadgeTestId.Root}
      {...rest}
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 border whitespace-nowrap font-mono font-semibold tracking-wide",
        sizeClasses[size],
        solid ? toneSolid[tone] : toneBase[tone],
      )}
    >
      {children}
    </span>
  );
}
