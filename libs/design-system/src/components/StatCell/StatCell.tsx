import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { type SheetTone, toneBorderBottom } from "../AnchoredSheet/sheetTone";

export enum StatCellTestId {
  Grid = "stat-cell-grid",
  Root = "stat-cell-root",
  Label = "stat-cell-label",
  Title = "stat-cell-title",
  Value = "stat-cell-value",
  Meta = "stat-cell-meta",
  Status = "stat-cell-status",
}

export interface StatCellGridProps {
  /** `3` = three equal stat cells in the sheet gutter; `fit` = auto-fit min 150px (task chain). */
  columns?: 3 | "fit";
  children: ReactNode;
}

/** Hairline-gap grid of `StatCell`s (1px apart, each ringed by `--line`). */
export function StatCellGrid({ columns = 3, children }: StatCellGridProps) {
  return (
    <div
      className={cn(
        "grid gap-px",
        columns === 3
          ? "mx-[20px] mt-[16px] grid-cols-[repeat(3,minmax(0,1fr))]"
          : "grid-cols-[repeat(auto-fit,minmax(150px,1fr))]",
      )}
      data-testid={StatCellTestId.Grid}
    >
      {children}
    </div>
  );
}

export interface StatCellProps {
  /** Colour of the 3px bottom border. */
  tone?: SheetTone;
  /** `--bg` fill (an active chain step). */
  filled?: boolean;
  /** Mono 10 caption. */
  label?: string;
  /** 13/500 name. */
  title?: string;
  /** 16/500 tabular value. */
  value?: string;
  /** Mono 10 secondary line. */
  meta?: string;
  /** Mono 10 / 600 state. */
  status?: string;
}

/** One metric cell: caption, value and/or lines, ringed by `--line` with a tone-coloured 3px bottom edge. */
export function StatCell({
  tone = "faint",
  filled = false,
  label,
  title,
  value,
  meta,
  status,
}: StatCellProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[4px] border-b-[3px] px-[12px] py-[10px] shadow-[0_0_0_1px_var(--color-line)]",
        toneBorderBottom[tone],
        filled ? "bg-bg" : "bg-transparent",
      )}
      data-testid={StatCellTestId.Root}
    >
      {label ? (
        <span
          className="font-sans font-semibold uppercase tracking-wider text-[10px] text-ink-3"
          data-testid={StatCellTestId.Label}
        >
          {label}
        </span>
      ) : null}
      {title ? (
        <span className="text-[13px] font-medium" data-testid={StatCellTestId.Title}>
          {title}
        </span>
      ) : null}
      {value ? (
        <span className="text-[16px] font-medium tabular-nums" data-testid={StatCellTestId.Value}>
          {value}
        </span>
      ) : null}
      {meta ? (
        <span
          className="font-sans uppercase tracking-wider text-[10px] text-ink-2"
          data-testid={StatCellTestId.Meta}
        >
          {meta}
        </span>
      ) : null}
      {status ? (
        <span
          className="font-sans font-semibold uppercase tracking-wider text-[10px]"
          data-testid={StatCellTestId.Status}
        >
          {status}
        </span>
      ) : null}
    </div>
  );
}
