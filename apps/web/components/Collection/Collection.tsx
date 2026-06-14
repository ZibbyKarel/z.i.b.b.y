import type { ReactNode } from "react";
import { Grid, type GridCols, type Spacing } from "@zibby/design-system";
import { EmptyState, type EmptyStateProps } from "../EmptyState/EmptyState";
import { LoadError, type LoadErrorProps } from "../LoadError/LoadError";
import { LoadingState, type LoadingStateProps } from "../LoadingState/LoadingState";

export interface CollectionProps<T> {
  items: readonly T[];
  /** Render a single item — must return a keyed node. */
  renderItem: (item: T) => ReactNode;
  /** Shown instead of the grid when `items` is empty. */
  empty: EmptyStateProps;
  /** Shown (over everything) while the list query is still pending — no empty-state flash. */
  loading?: LoadingStateProps;
  /** Shown (over `empty`) when the list query failed — so an outage never reads as "empty". */
  error?: LoadErrorProps;
  cols?: GridCols;
  sm?: GridCols;
  lg?: GridCols;
  gap?: Spacing;
}

export function Collection<T>({
  items,
  renderItem,
  empty,
  loading,
  error,
  cols = 1,
  sm = 2,
  lg = 3,
  gap = "150",
}: CollectionProps<T>) {
  // Honest load states: loading → error → empty → grid. A pending or failed load must
  // never read as an empty workspace.
  if (loading) {
    return <LoadingState {...loading} />;
  }
  if (error) {
    return <LoadError {...error} />;
  }
  if (items.length === 0) {
    return <EmptyState {...empty} />;
  }
  return (
    <Grid cols={cols} gap={gap} lg={lg} sm={sm}>
      {items.map(renderItem)}
    </Grid>
  );
}
