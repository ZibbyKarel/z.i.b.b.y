import type { Ref } from "react";
import { Progress } from "../Progress/Progress";
import { BoardText } from "../BoardText/BoardText";

export enum RowGroupHeaderTestId {
  Root = "row-group-header-root",
  Caret = "row-group-header-caret",
  Key = "row-group-header-key",
  Title = "row-group-header-title",
  Count = "row-group-header-count",
}

export interface RowGroupHeaderProps {
  title: string;
  /** Short key (`EPIC-12`, `—`). */
  groupKey: string;
  /** `done/total` text. */
  count: string;
  /** 0–100 for the 2px ink progress bar. */
  progress: number;
  closed: boolean;
  onToggle: () => void;
  /** Accessible name of the toggle. */
  label?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** A collapsible group header (an epic): caret, key, title, 2px progress, done/total. */
export function RowGroupHeader({
  title,
  groupKey,
  count,
  progress,
  closed,
  onToggle,
  label,
  ref,
}: RowGroupHeaderProps) {
  return (
    <button
      aria-expanded={!closed}
      aria-label={label}
      className="box-border grid w-full cursor-pointer grid-cols-[10px_auto_minmax(0,1fr)_56px_auto] items-center gap-[8px] bg-bg px-[var(--bridge-epic-px)] py-[var(--bridge-epic-py)] text-left [border-bottom:var(--bridge-row-border)] hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      data-testid={RowGroupHeaderTestId.Root}
      onClick={onToggle}
      ref={ref}
      type="button"
    >
      <span className="font-mono text-[10px] text-ink-2" data-testid={RowGroupHeaderTestId.Caret}>
        {closed ? "▸" : "▾"}
      </span>
      <span className="flex" data-testid={RowGroupHeaderTestId.Key}>
        <BoardText kind="meta">{groupKey}</BoardText>
      </span>
      <span className="flex" data-testid={RowGroupHeaderTestId.Title}>
        <BoardText kind="title">{title}</BoardText>
      </span>
      <Progress height="25" tone="ink" value={progress} />
      <span className="flex" data-testid={RowGroupHeaderTestId.Count}>
        <BoardText tabular kind="meta">
          {count}
        </BoardText>
      </span>
    </button>
  );
}
