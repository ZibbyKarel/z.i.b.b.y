import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum GraphIconButtonTestId {
  Root = "graph-icon-button",
}

export type GraphIconButtonVariant = "plain" | "step";

const variantClass: Record<GraphIconButtonVariant, string> = {
  // A borderless disconnect/remove glyph button (an edge's "x").
  plain: cn(
    "grid size-4 place-items-center rounded-sm border-none bg-transparent",
    "text-foreground-faint hover:text-foreground",
  ),
  // A bordered mono +/- stepper cell (the rework arc's max-retries control).
  step: cn(
    "grid size-[15px] place-items-center rounded-sm border border-border bg-transparent",
    "font-mono text-[11px] leading-none text-foreground-dim hover:text-foreground",
  ),
};

export interface GraphIconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  variant?: GraphIconButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The pipeline canvas's tiny icon/glyph buttons (`components/Graph/`, ZA-07):
 * an edge's disconnect "x" and the rework arc's retry-count stepper. See
 * {@link GraphInlineInput}'s doc comment for why these live in the design
 * system rather than as inline `apps/web` Tailwind (D-007).
 */
export function GraphIconButton({
  variant = "plain",
  type = "button",
  ref,
  ...rest
}: GraphIconButtonProps) {
  return (
    <button
      className={cn(variantClass[variant], focusRing)}
      data-testid={GraphIconButtonTestId.Root}
      ref={ref}
      type={type}
      {...rest}
    />
  );
}
