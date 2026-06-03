import type { ReactNode } from "react";
import { Grid, type GridCols, type Spacing } from "@zibby/design-system";

export interface CardGridProps {
  children: ReactNode;
  /** Columns at the base breakpoint. */
  cols?: GridCols;
  /** Columns from the `sm` breakpoint up. */
  sm?: GridCols;
  /** Columns from the `lg` breakpoint up. */
  lg?: GridCols;
  gap?: Spacing;
}

/**
 * The responsive card grid used across the dashboard collections (skills,
 * integrations, agent sections): one column on mobile, two at `sm`, three at
 * `lg`. Replaces the repeated `<Grid cols={1} gap="150" lg={3} sm={2}>`.
 */
export function CardGrid({
  children,
  cols = 1,
  sm = 2,
  lg = 3,
  gap = "150",
}: CardGridProps) {
  return (
    <Grid cols={cols} gap={gap} lg={lg} sm={sm}>
      {children}
    </Grid>
  );
}
