import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export enum SheetPartsTestId {
  Section = "sheet-section",
  Columns = "sheet-columns",
  Block = "sheet-block",
  BlockLabel = "sheet-block-label",
  Text = "sheet-text",
  Action = "sheet-action",
}

/** Body section: padding 18/20, 22px between blocks. */
export function SheetSection({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-[22px] px-[20px] py-[18px]"
      data-testid={SheetPartsTestId.Section}
    >
      {children}
    </div>
  );
}

/** Two responsive columns (auto-fit, min 300px) — each child is a column of `SheetBlock`s. */
export function SheetColumns({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-[28px] gap-y-[22px] px-[20px] py-[18px] [&>*]:flex [&>*]:min-w-0 [&>*]:flex-col [&>*]:gap-[22px]"
      data-testid={SheetPartsTestId.Columns}
    >
      {children}
    </div>
  );
}

/** A labelled block: mono 11 / .14em section label over its content (8px apart). */
export function SheetBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[8px]" data-testid={SheetPartsTestId.Block}>
      <span
        className="font-mono text-[11px] tracking-[.14em] text-ink-3"
        data-testid={SheetPartsTestId.BlockLabel}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** Body copy: 14 / 1.45, one paragraph per line. */
export function SheetText({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <p
          className="m-0 text-[14px] leading-[1.45] [text-wrap:pretty]"
          data-testid={SheetPartsTestId.Text}
          key={`${i}-${l}`}
        >
          {l}
        </p>
      ))}
    </>
  );
}

export interface SheetActionProps {
  /** `ghost` = 1px outline; `primary` = filled ink. */
  intent?: "ghost" | "primary";
  /** Renders an `<a target=_blank>` when set, a `<button>` otherwise. */
  href?: string;
  onClick?: () => void;
  /** Dimmed to 35% + `not-allowed`; a button gets `aria-disabled` and ignores clicks. */
  disabled?: boolean;
  title?: string;
  children: ReactNode;
  "data-testid"?: string;
}

/** A footer action in the sheet's mono style (reference `OPEN ON GITHUB ↗`, `PROCESS INTO A TASK`, …). */
export function SheetAction({
  intent = "ghost",
  href,
  onClick,
  disabled = false,
  title,
  children,
  "data-testid": testId,
}: SheetActionProps) {
  const cls = cn(
    "no-underline",
    intent === "primary"
      ? "bg-ink px-[16px] py-[8px] text-panel"
      : "border border-line-2 px-[12px] py-[8px] text-ink-2 hover:bg-panel-2 hover:text-ink",
    disabled
      ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-ink-2"
      : "cursor-pointer",
  );
  return href && !disabled ? (
    <a
      className={cls}
      data-testid={testId ?? SheetPartsTestId.Action}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={title}
    >
      {children}
    </a>
  ) : (
    <button
      aria-disabled={disabled || undefined}
      className={cls}
      data-testid={testId ?? SheetPartsTestId.Action}
      onClick={disabled ? undefined : onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}
