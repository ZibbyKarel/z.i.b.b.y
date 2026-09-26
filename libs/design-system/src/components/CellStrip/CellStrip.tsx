import type { HTMLAttributes, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { StateDot } from "../StatePill/StatePill";
import { Typography } from "../Typography/Typography";

export enum CellStripTestId {
  Root = "cell-strip-root",
  Cell = "cell-strip-cell",
  Overflow = "cell-strip-overflow",
}

export interface CellStripProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  /** One state per agent, in department order — DS.md §7's "department micro-summary". */
  cells: readonly StateTone[];
  /** Cap the rendered dots; the remainder collapses into a trailing `+N`. Omit to
   *  render every cell. */
  max?: number;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * A wrapping row of 9px square status dots — DS.md §7's `Cell strip`, one dot per
 * agent, the department-card "who's doing what" glance. Reuses the same
 * {@link StateDot} mark `StatePill` renders at a smaller size.
 */
export function CellStrip({ cells, max, ref, ...props }: CellStripProps) {
  const shown = max !== undefined ? cells.slice(0, max) : cells;
  const overflow = max !== undefined ? Math.max(0, cells.length - max) : 0;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      data-testid={CellStripTestId.Root}
      ref={ref}
      {...props}
    >
      {shown.map((state, i) => (
        <StateDot data-testid={CellStripTestId.Cell} key={`${i}-${state}`} px={9} state={state} />
      ))}
      {overflow > 0 && (
        <Typography data-testid={CellStripTestId.Overflow} type="labelSm">
          +{overflow}
        </Typography>
      )}
    </span>
  );
}
