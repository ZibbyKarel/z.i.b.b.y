import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { type SheetTone, toneBorderLeft } from "../AnchoredSheet/sheetTone";

export enum DetailTableTestId {
  Root = "detail-table-root",
  Row = "detail-table-row",
  Cell = "detail-table-cell",
  Empty = "detail-table-empty",
}

/**
 * Row layouts of the reference detail sheet:
 * `kv` 110px/1fr key-value · `subtask` 96/44/1fr/90/1fr · `check` 1fr/auto (tone rail) · `file` 1fr/auto.
 */
export type DetailTableVariant = "kv" | "subtask" | "check" | "file";

export interface DetailTableRow {
  cells: readonly ReactNode[];
  /** Left rail colour for `subtask` / `check` rows. */
  tone?: SheetTone;
}

const rowBase: Record<DetailTableVariant, string> = {
  kv: "grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] py-[8px]",
  subtask:
    "grid grid-cols-[96px_44px_minmax(0,1fr)_90px_minmax(0,1fr)] items-center gap-[10px] border-l-[3px] py-[8px] pl-[10px] font-sans uppercase tracking-wider text-[10px]",
  check:
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[10px] border-l-[3px] py-[7px] pl-[10px] font-sans uppercase tracking-wider text-[10px]",
  file: "grid grid-cols-[minmax(0,1fr)_auto] gap-[10px] py-[7px] font-mono text-[11px]",
};

// Per-column classes (index = cell position).
const cellCls: Record<DetailTableVariant, readonly string[]> = {
  kv: ["font-sans font-semibold uppercase tracking-wider text-[10px] text-ink-3", "text-[13px]"],
  subtask: [
    "text-ink-2",
    "",
    "text-ink-2",
    "",
    "overflow-hidden text-ellipsis whitespace-nowrap text-ink-3",
  ],
  check: ["", "text-ink-2"],
  file: ["overflow-hidden text-ellipsis whitespace-nowrap", "tabular-nums text-ink-2"],
};

export interface DetailTableProps {
  variant?: DetailTableVariant;
  rows: readonly DetailTableRow[];
  /** Shown (as a bordered note) when there are no rows. */
  emptyText?: string;
}

/** Hairline-ruled rows (1px `--line` top rule each) in one of the reference's column layouts. */
export function DetailTable({ variant = "kv", rows, emptyText }: DetailTableProps) {
  return (
    <div className="flex flex-col" data-testid={DetailTableTestId.Root}>
      {rows.map((row, i) => (
        <div
          className={cn(
            "border-t border-line",
            rowBase[variant],
            toneBorderLeft[row.tone ?? "faint"],
          )}
          data-testid={DetailTableTestId.Row}
          key={i}
        >
          {row.cells.map((cell, j) => (
            <span className={cellCls[variant][j]} data-testid={DetailTableTestId.Cell} key={j}>
              {cell}
            </span>
          ))}
        </div>
      ))}
      {rows.length === 0 && emptyText ? (
        <div
          className="border-t border-line py-[9px] text-[12px] text-ink-2"
          data-testid={DetailTableTestId.Empty}
        >
          {emptyText}
        </div>
      ) : null}
    </div>
  );
}
