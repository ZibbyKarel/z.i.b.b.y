import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";

export enum GraphInlineInputTestId {
  Root = "graph-inline-input",
}

export type GraphInlineInputVariant = "ghost" | "field";

const variantClass: Record<GraphInlineInputVariant, string> = {
  // A value floating directly on the canvas: no chrome of its own (an edge's
  // hand-off filename, a node's output-file field) — accent, monospace text.
  ghost: "border-none bg-transparent font-mono text-[10px] text-accent",
  // A bordered, background-filled text box — the pipeline dialog's name/
  // description fields sitting in its non-canvas top bar.
  field: cn(
    "rounded-sm border border-border bg-[var(--color-background-deep)] px-2.5 py-1.5",
    "text-[13px] text-foreground focus:border-ink",
  ),
};

export interface GraphInlineInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "size"
> {
  variant?: GraphInlineInputVariant;
  /** `field` variant only: bolder, slightly larger text — the pipeline
   *  dialog's name field vs. its plain-weight description field. */
  weight?: "normal" | "bold";
  /** Native `size` attribute (character-count width) — ghost variant's
   *  auto-width-to-content fields. */
  size?: number;
  ref?: Ref<HTMLInputElement>;
}

/**
 * The pipeline canvas's unlabeled inline text inputs (`components/Graph/`,
 * ZA-07): a node's output-file field, an edge's hand-off filename, and the
 * pipeline dialog's name/description fields. Two variants share one focus
 * ring and one home for the Tailwind classes apps/web is no longer allowed
 * to author itself (D-007) — the canvas positioning/coloring around them
 * stays in `apps/web` via `Container`'s `style` passthrough (a DS prop, not a
 * raw DOM className).
 */
export function GraphInlineInput({
  variant = "ghost",
  weight = "normal",
  ref,
  ...rest
}: GraphInlineInputProps) {
  return (
    <input
      className={cn(
        "min-w-0 outline-none",
        variantClass[variant],
        variant === "field" && weight === "bold" && "font-mono text-sm font-bold",
        focusRing,
      )}
      data-testid={GraphInlineInputTestId.Root}
      ref={ref}
      spellCheck={false}
      {...rest}
    />
  );
}
