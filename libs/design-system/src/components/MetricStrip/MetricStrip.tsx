import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Typography } from "../Typography/Typography";

export interface MetricStripItem {
  label: string;
  /** A string / number, or a node for composed values (icon + text, coloured parts, a link). */
  value: ReactNode;
  /** Small caption beneath the value (e.g. a delta or a unit note). */
  hint?: string;
  /** An action under the value (e.g. a small button acting on this metric). */
  action?: ReactNode;
  /** Stable id: the column's test id becomes `metric-strip-item-<id>` instead of its index. */
  id?: string;
}

export enum MetricStripTestId {
  Root = "metric-strip-root",
  /** Each column is suffixed with its `id` or index, e.g. `metric-strip-item-0`. */
  Item = "metric-strip-item",
  Label = "metric-strip-label",
  Value = "metric-strip-value",
  Hint = "metric-strip-hint",
  Action = "metric-strip-action",
}

export type MetricStripColumns = 2 | 3 | 4 | 5 | 6;

export interface MetricStripProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  items: MetricStripItem[];
  /** Fixed column count (DS.md §8 Inspector's "metric strip: 3 columns"). */
  columns: MetricStripColumns;
  ref?: Ref<HTMLDivElement>;
}

const gridColsClass: Record<MetricStripColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/** DS.md §8 Inspector metric strip — N equal columns of label/value pairs,
 * bounded top and bottom by a hairline. Recurs across department headers,
 * profiles, approvals, runs, and the PR / issue detail summaries. */
export function MetricStrip({ items, columns, ref, ...rest }: MetricStripProps) {
  return (
    <div
      className={`grid ${gridColsClass[columns]} border-t border-b border-border`}
      data-testid={MetricStripTestId.Root}
      ref={ref}
      {...rest}
    >
      {items.map((item, i) => (
        <div
          className="flex min-w-0 flex-col gap-1 py-3 pr-2"
          data-testid={`${MetricStripTestId.Item}-${item.id ?? i}`}
          key={item.id ?? i}
        >
          <Typography data-testid={MetricStripTestId.Label} tracking="wider" type="labelSm">
            {item.label}
          </Typography>
          <Typography as="div" data-testid={MetricStripTestId.Value} type="metric">
            {item.value}
          </Typography>
          {item.hint && (
            <Typography data-testid={MetricStripTestId.Hint} type="caption" variant="secondary">
              {item.hint}
            </Typography>
          )}
          {item.action ? (
            <div className="flex flex-wrap gap-1 pt-1" data-testid={MetricStripTestId.Action}>
              {item.action}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
