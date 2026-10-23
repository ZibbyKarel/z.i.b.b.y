import type { ReactNode, Ref } from "react";
import type { StateTone } from "../../stateTone";
import { cn } from "../../utils/cn";

export enum BoardRowTestId {
  Root = "board-row-root",
  Grid = "board-row-grid",
  ColumnHeader = "board-row-column-header",
  Line = "board-row-line",
  /** Wrapper drawn as the row when an `action` is set (bar, hairline, rings). */
  Frame = "board-row-frame",
  /** The trailing `action` slot — a sibling of the row body, never inside it. */
  Action = "board-row-action",
}

export type BoardRowTone = StateTone | "neutral";

/** Column templates of the Bridge widgets (literal values from the handoff). */
export type BoardColumns = "issue" | "task" | "run";

const TEMPLATE: Record<BoardColumns, string> = {
  issue: "grid-cols-[16px_minmax(0,1fr)_auto] gap-[8px]",
  task: "grid-cols-[66px_minmax(0,1fr)_auto_auto] gap-[10px]",
  run: "grid-cols-[minmax(0,1fr)_120px_64px] gap-[10px]",
};

const BAR: Record<BoardRowTone, string> = {
  working: "border-l-[color:var(--color-state-work)]",
  thinking: "border-l-[color:var(--color-state-think)]",
  blocked: "border-l-[color:var(--color-state-block)]",
  error: "border-l-[color:var(--color-state-err)]",
  done: "border-l-[color:var(--color-state-done)]",
  idle: "border-l-[color:var(--color-state-idle)]",
  neutral: "border-l-line-2",
};

export interface BoardRowProps {
  /** Left status bar colour. */
  tone: BoardRowTone;
  /** `pr` = the taller PR-card padding. */
  padding?: "row" | "pr";
  /** Grid template; omit for a stacked (flex column) row. */
  columns?: BoardColumns;
  /** The row whose detail sheet is open: raised above the overlay, inked top/bottom. */
  selected?: boolean;
  /** Side the sheet opens to — the shared edge gets no ink rule. Default `right`. */
  sheetSide?: "left" | "right";
  /** Needs the operator: 1px ink ring. */
  needsYou?: boolean;
  /** Unique row key within the board; set as `data-rk` (the sheet anchors to it). */
  rowKey?: string;
  onClick?: () => void;
  /**
   * A trailing control (e.g. a small `Button`) at the right of the row's first line. The row
   * then renders a `Frame` wrapper carrying the bar / hairline / rings, in which the row body
   * (the `Root` button or div, which shrinks) and the `Action` slot are siblings — never a
   * button inside a button. A click on the action never reaches the row's `onClick`.
   */
  action?: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const PADDING = {
  row: "px-[var(--bridge-row-px)] py-[var(--bridge-row-py)]",
  pr: "px-[var(--bridge-pr-px)] py-[var(--bridge-pr-py)]",
} as const;

/** Action-slot padding: the row's top + right padding, so the control sits on the first line. */
const ACTION_PADDING = {
  row: "pt-[var(--bridge-row-py)] pr-[var(--bridge-row-px)]",
  pr: "pt-[var(--bridge-pr-py)] pr-[var(--bridge-pr-px)]",
} as const;

/**
 * One board row: left status bar, density-driven padding + hairline, hover `panel-2`,
 * `selected` / `needsYou` rings. With `onClick` a real `button` (keyboard + focus ring); without
 * it a static, non-focusable `div`. Content must be phrasing elements (`BoardText`, `BoardGrid`, ...).
 * With `action`, see {@link BoardRowProps.action}.
 */
export function BoardRow({
  tone,
  padding = "row",
  columns,
  selected = false,
  sheetSide = "right",
  needsYou = false,
  rowKey,
  onClick,
  action,
  children,
  ref,
}: BoardRowProps) {
  const interactive = onClick !== undefined;
  const Tag = interactive ? "button" : "div";
  const framed = action !== undefined && action !== null;

  /** The visual row: bar, hairline, panel fill, hover and the selected / needsYou rings. */
  const chrome = cn(
    "relative box-border w-full border-solid bg-panel text-left text-ink",
    interactive && "hover:bg-panel-2",
    "border-l-[length:var(--bridge-bar)] [border-bottom:var(--bridge-row-border)]",
    BAR[tone],
    selected
      ? cn(
          "z-[31] shadow-[inset_0_1px_0_var(--color-ink),inset_0_-1px_0_var(--color-ink)]",
          sheetSide === "left" &&
            "shadow-[inset_0_1px_0_var(--color-ink),inset_0_-1px_0_var(--color-ink),inset_-1px_0_0_var(--color-ink)]",
        )
      : needsYou && "shadow-[inset_0_0_0_1px_var(--color-ink)]",
  );
  /** The row body: padding, inner layout, the interactive affordances. */
  const body = cn(
    interactive && "cursor-pointer appearance-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    PADDING[padding],
    columns
      ? cn("grid items-center", TEMPLATE[columns])
      : "flex flex-col gap-[var(--bridge-inner-gap)]",
  );

  const row = (
    <Tag
      aria-pressed={interactive ? selected : undefined}
      className={
        framed
          ? cn("box-border min-w-0 flex-1 border-0 bg-transparent text-left text-ink", body)
          : cn(chrome, body)
      }
      data-rk={rowKey}
      data-testid={BoardRowTestId.Root}
      onClick={onClick}
      ref={ref as Ref<HTMLDivElement & HTMLButtonElement>}
      type={interactive ? "button" : undefined}
    >
      {children}
    </Tag>
  );
  if (!framed) return row;

  return (
    <div className={cn(chrome, "flex items-stretch")} data-testid={BoardRowTestId.Frame}>
      {row}
      <span
        className={cn("flex flex-none items-start", ACTION_PADDING[padding])}
        data-testid={BoardRowTestId.Action}
      >
        {action}
      </span>
    </div>
  );
}

export interface BoardGridProps {
  columns: BoardColumns;
  children?: ReactNode;
}

/** An inner grid line inside a stacked row (e.g. `issue`: id · title · tag). */
export function BoardGrid({ columns, children }: BoardGridProps) {
  return (
    <span className={cn("grid items-center", TEMPLATE[columns])} data-testid={BoardRowTestId.Grid}>
      {children}
    </span>
  );
}

export interface BoardColumnHeaderProps {
  columns: BoardColumns;
  children?: ReactNode;
}

/** The column-title line above a grid widget's rows (Running now). */
export function BoardColumnHeader({ columns, children }: BoardColumnHeaderProps) {
  return (
    <div
      className={cn(
        "grid items-center border-b border-line py-[6px] pl-[16px] pr-[12px]",
        TEMPLATE[columns],
      )}
      data-testid={BoardRowTestId.ColumnHeader}
    >
      {children}
    </div>
  );
}

const LINE_GAP = {
  "3": "gap-[3px]",
  "5": "gap-[5px]",
  "6": "gap-[6px]",
  "8": "gap-[8px]",
} as const;

export interface BoardLineProps {
  /** Gap in px between the line's parts. */
  gap: keyof typeof LINE_GAP;
  /** `col` stacks the parts. Default `row`. */
  direction?: "row" | "col";
  /** `true`: left padding of 92px (past an 84px id column). `"icon"`: 24px — aligns under the text past a 16px icon + 8px gap. */
  indent?: boolean | "icon";
  wrap?: boolean;
  baseline?: boolean;
  /** Spread parts to both ends. */
  between?: boolean;
  /** Pinned to the right end of the line. */
  end?: ReactNode;
  children?: ReactNode;
}

/** A flex line inside a row (meta chips, PR status, a two-line cell). */
export function BoardLine({
  gap,
  direction = "row",
  indent = false,
  wrap = false,
  baseline = false,
  between = false,
  end,
  children,
}: BoardLineProps) {
  return (
    <span
      className={cn(
        "flex min-w-0",
        LINE_GAP[gap],
        direction === "col" ? "flex-col" : baseline ? "items-baseline" : "items-center",
        indent && cn("overflow-hidden", indent === "icon" ? "pl-[24px]" : "pl-[92px]"),
        wrap && "flex-wrap",
        between && "justify-between",
      )}
      data-testid={BoardRowTestId.Line}
    >
      {children}
      {end ? <span className="ml-auto flex">{end}</span> : null}
    </span>
  );
}
