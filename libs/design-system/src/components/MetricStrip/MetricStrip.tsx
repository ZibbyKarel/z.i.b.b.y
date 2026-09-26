import type { HTMLAttributes, Ref } from "react";
import { Typography } from "../Typography/Typography";

export interface MetricStripItem {
  label: string;
  value: string | number;
  /** Small caption beneath the value (e.g. a delta or a unit note). */
  hint?: string;
}

export enum MetricStripTestId {
  Root = "metric-strip-root",
  /** Each column is suffixed with its index, e.g. `metric-strip-item-0`. */
  Item = "metric-strip-item",
  Label = "metric-strip-label",
  Value = "metric-strip-value",
  Hint = "metric-strip-hint",
}

export interface MetricStripProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  items: MetricStripItem[];
  /** Fixed column count (DS.md §8 Inspector's "metric strip: 3 columns"). */
  columns: 3 | 4;
  ref?: Ref<HTMLDivElement>;
}

const gridColsClass: Record<3 | 4, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/** DS.md §8 Inspector metric strip — N equal columns of label/value pairs,
 * bounded top and bottom by a hairline. Recurs across department headers,
 * profiles, approvals and runs. */
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
          className="flex flex-col gap-1 py-3"
          data-testid={`${MetricStripTestId.Item}-${i}`}
          key={i}
        >
          <Typography data-testid={MetricStripTestId.Label} tracking="wider" type="labelSm">
            {item.label}
          </Typography>
          <Typography data-testid={MetricStripTestId.Value} type="metric">
            {item.value}
          </Typography>
          {item.hint && (
            <Typography data-testid={MetricStripTestId.Hint} type="caption" variant="secondary">
              {item.hint}
            </Typography>
          )}
        </div>
      ))}
    </div>
  );
}
