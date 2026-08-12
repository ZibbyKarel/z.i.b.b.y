import type { CSSProperties, FC, HTMLAttributes, Ref } from "react";
import { type Spacing, spacingToPx } from "../../tokens";
import { cn } from "../../utils/cn";

export enum GridTestId {
  Root = "grid-root",
}

export type GridCols = 1 | 2 | 3 | 4 | 5;
export type GridAlign = "start" | "center" | "end" | "stretch";

const baseCols: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};
const smCols: Record<GridCols, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
};
const mdCols: Record<GridCols, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
};
const lgCols: Record<GridCols, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};

const alignClass: Record<GridAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export interface GridProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  cols?: GridCols;
  sm?: GridCols;
  md?: GridCols;
  lg?: GridCols;
  /**
   * Responsive dashboard split (overrides cols): "right" = content + 360px rail,
   * "left" = 320px list + content, "left-wide" = the same split proportionally
   * (~33% list + content) for a rail whose rows carry real prose — a fixed 320px
   * truncates them regardless of how much room the viewport actually has.
   * Single column below the lg breakpoint.
   */
  sidebar?: "left" | "left-wide" | "right";
  gap?: Spacing;
  align?: GridAlign;
  maxWidth?: string;
  /** Centre the grid horizontally within its parent. */
  center?: boolean;
  as?: "div" | "section" | "ul" | "ol";
  ref?: Ref<HTMLElement>;
}

/** Responsive CSS grid with a sealed column scale. */
export function Grid({
  cols = 1,
  sm,
  md,
  lg,
  sidebar,
  gap,
  align,
  maxWidth,
  center,
  as: Tag = "div",
  style,
  ref,
  ...rest
}: GridProps) {
  const computedStyle: CSSProperties = {
    display: "grid",
    gap: gap !== undefined ? spacingToPx(gap) : undefined,
    maxWidth,
    marginInline: center ? "auto" : undefined,
    ...style,
  };

  // Rendering through a bare `ElementType` breaks once any library augments
  // React.JSX.IntrinsicElements globally — see the identical cast in Stack.tsx for
  // the full rationale. `as` is a closed union of DOM tags, so the tag is cast to a
  // component signature carrying exactly the props Grid forwards; this also lets
  // `data-testid` sit before `{...rest}` below without an `any` spread.
  const Component = Tag as unknown as FC<
    Omit<HTMLAttributes<HTMLElement>, "className"> & {
      ref?: Ref<HTMLElement>;
      style?: CSSProperties;
      // Grid computes its own className from CVA-style Tailwind maps (unlike Stack,
      // which is styled entirely via inline `style`) — GridProps still omits
      // `className` from the public surface, so this only re-admits it for Grid's
      // own internal use below, never for a consumer.
      className?: string;
      "data-testid"?: string;
    }
  >;

  return (
    <Component
      data-testid={GridTestId.Root}
      {...rest}
      className={cn(
        sidebar === "right" && "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]",
        sidebar === "left" && "grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]",
        sidebar === "left-wide" && "grid-cols-1 lg:grid-cols-[minmax(0,33%)_minmax(0,1fr)]",
        !sidebar && [baseCols[cols], sm && smCols[sm], md && mdCols[md], lg && lgCols[lg]],
        align && alignClass[align],
      )}
      ref={ref}
      style={computedStyle}
    />
  );
}
