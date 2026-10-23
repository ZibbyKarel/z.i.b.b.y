import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";

export enum BoardTextTestId {
  Root = "board-text-root",
}

/** The Bridge board's text voices (literal values from the design handoff). */
export type BoardTextKind =
  /** Row id — mono 10 / .06em. */
  | "id"
  /** Row title — 13 / 500, one line, ellipsis. */
  | "title"
  /** Row title, regular weight (Tasks / Running). */
  | "body"
  /** Caps 10 / .1em metadata. */
  | "meta"
  /** PR number — mono 11. */
  | "prNum"
  /** PR title — 13 / 500 / 1.35, wraps. */
  | "prTitle"
  /** PR meta + status lines — caps 10 / .1em. */
  | "prMeta"
  /** Briefing lead paragraph — 14 / 1.45. */
  | "lead"
  /** Caps 10 / .1em / 600 kicker (briefing date). */
  | "kicker"
  /** Caps 10 / .1em / 600 column header. */
  | "colHead"
  /** Mono 10, one line, ellipsis (issue link). */
  | "link";

export type BoardTextTone = "ink" | "ink2" | "ink3";

const KIND: Record<BoardTextKind, string> = {
  id: "font-mono text-[10px] whitespace-nowrap text-ink-2",
  title: "block min-w-0 truncate text-[13px] font-medium text-ink",
  body: "block min-w-0 truncate text-[13px] text-ink",
  meta: "font-sans uppercase tracking-wider text-[10px] whitespace-nowrap text-ink-2",
  prNum: "flex-none font-mono text-[11px] text-ink-2",
  prTitle: "min-w-0 flex-1 text-[13px] font-medium leading-[1.35] [text-wrap:pretty] text-ink",
  prMeta: "font-sans uppercase tracking-wider text-[10px] text-ink-2",
  lead: "m-0 block text-[14px] leading-[1.45] [text-wrap:pretty] text-ink-2",
  kicker: "font-sans font-semibold uppercase tracking-wider text-[10px] text-ink-3",
  colHead:
    "font-sans font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap text-ink-3",
  link: "block truncate font-mono text-[10px] whitespace-nowrap text-ink",
};

const TONE: Record<BoardTextTone, string> = {
  ink: "text-ink",
  ink2: "text-ink-2",
  ink3: "text-ink-3",
};

export interface BoardTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  kind: BoardTextKind;
  /** Overrides the kind's default colour. */
  tone?: BoardTextTone;
  bold?: boolean;
  underline?: boolean;
  tabular?: boolean;
  /** One line with an ellipsis (block-level). */
  truncate?: boolean;
  align?: "right";
  children?: ReactNode;
  ref?: Ref<HTMLSpanElement>;
}

/** Text in one of the Bridge board's voices. A `span` so it is valid inside a row button. */
export function BoardText({
  kind,
  tone,
  bold,
  underline,
  tabular,
  truncate,
  align,
  children,
  ref,
  ...props
}: BoardTextProps) {
  return (
    <span
      className={cn(
        KIND[kind],
        tone && TONE[tone],
        bold && "font-semibold",
        underline && "underline underline-offset-2",
        tabular && "tabular-nums",
        truncate && "block min-w-0 truncate",
        align === "right" && "block text-right",
      )}
      data-testid={BoardTextTestId.Root}
      ref={ref}
      {...props}
    >
      {children}
    </span>
  );
}
