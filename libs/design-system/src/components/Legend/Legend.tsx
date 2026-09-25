import type { HTMLAttributes, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { StateDot } from "../StatePill/StatePill";
import { Typography } from "../Typography/Typography";

export interface LegendItem {
  state: StateTone;
  label: string;
  count: number;
}

export enum LegendTestId {
  Root = "legend-root",
  /** Each row is suffixed with its `state`, e.g. `legend-row-working`. */
  Row = "legend-row",
  Dot = "legend-dot",
  Label = "legend-label",
  Count = "legend-count",
}

export interface LegendProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  items: LegendItem[];
  ref?: Ref<HTMLDivElement>;
}

/** DS.md §8 legend — a 2-column grid of dot + label + count rows, the org map's
 * and people directory's state key. */
export function Legend({ items, ref, ...rest }: LegendProps) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-2.5"
      data-testid={LegendTestId.Root}
      ref={ref}
      {...rest}
    >
      {items.map((item) => (
        <div
          className="flex items-center gap-2"
          data-testid={`${LegendTestId.Row}-${item.state}`}
          key={item.state}
        >
          <StateDot data-testid={LegendTestId.Dot} px={7} state={item.state} />
          <Typography
            data-testid={LegendTestId.Label}
            style={{ flex: 1 }}
            tracking="wider"
            type="labelSm"
          >
            {item.label}
          </Typography>
          <Typography
            data-testid={LegendTestId.Count}
            style={{ fontVariantNumeric: "tabular-nums" }}
            type="labelSm"
            variant="tertiary"
          >
            {item.count}
          </Typography>
        </div>
      ))}
    </div>
  );
}
