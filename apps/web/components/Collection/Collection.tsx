import type { ReactNode } from "react";
import { CardGrid, type CardGridProps } from "../CardGrid/CardGrid";
import { EmptyState, type EmptyStateProps } from "../EmptyState/EmptyState";

export interface CollectionProps<T> {
  items: readonly T[];
  /** Render a single item — must return a keyed node. */
  renderItem: (item: T) => ReactNode;
  /** Shown instead of the grid when `items` is empty. */
  empty: EmptyStateProps;
  /** Grid column overrides, forwarded to CardGrid. */
  cols?: CardGridProps["cols"];
  sm?: CardGridProps["sm"];
  lg?: CardGridProps["lg"];
  gap?: CardGridProps["gap"];
}

/**
 * Renders a collection as a responsive {@link CardGrid}, or an
 * {@link EmptyState} when there are no items. Captures the
 * `list.length === 0 ? <EmptyState/> : <Grid>…</Grid>` branch repeated across the
 * skills and integrations screens.
 */
export function Collection<T>({
  items,
  renderItem,
  empty,
  cols,
  sm,
  lg,
  gap,
}: CollectionProps<T>) {
  if (items.length === 0) {
    return <EmptyState {...empty} />;
  }
  return (
    <CardGrid cols={cols} gap={gap} lg={lg} sm={sm}>
      {items.map(renderItem)}
    </CardGrid>
  );
}
