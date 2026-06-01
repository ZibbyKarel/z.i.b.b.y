import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";
import { spacingToPx, type Spacing } from "../../tokens";

export enum GridTestId {
  Root = "grid-root",
}

export type GridCols = 1 | 2 | 3 | 4;
export type GridAlign = "start" | "center" | "end" | "stretch";

const baseCols: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};
const smCols: Record<GridCols, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};
const mdCols: Record<GridCols, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};
const lgCols: Record<GridCols, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
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
   * "left" = 320px list + content. Single column below the lg breakpoint.
   */
  sidebar?: "left" | "right";
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

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(rest as any)}
      data-testid={GridTestId.Root}
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        sidebar === "right" && "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]",
        sidebar === "left" && "grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]",
        !sidebar && [
          baseCols[cols],
          sm && smCols[sm],
          md && mdCols[md],
          lg && lgCols[lg],
        ],
        align && alignClass[align],
      )}
      style={computedStyle}
    />
  );
}
