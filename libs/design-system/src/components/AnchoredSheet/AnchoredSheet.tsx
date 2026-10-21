import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { type SheetTone, toneBorderTop } from "./sheetTone";

export enum AnchoredSheetTestId {
  Overlay = "anchored-sheet-overlay",
  Root = "anchored-sheet-root",
  Eraser = "anchored-sheet-eraser",
  Header = "anchored-sheet-header",
  Kind = "anchored-sheet-kind",
  State = "anchored-sheet-state",
  Hint = "anchored-sheet-hint",
  Close = "anchored-sheet-close",
  Title = "anchored-sheet-title",
  Chip = "anchored-sheet-chip",
  Body = "anchored-sheet-body",
  Footer = "anchored-sheet-footer",
  FooterNote = "anchored-sheet-footer-note",
}

export interface AnchoredSheetProps {
  /** Mono eyebrow left of the state, e.g. `PULL REQUEST · #12`. */
  kind: string;
  /** Bold state label next to it, e.g. `CI FAILING`. */
  stateLabel?: string;
  /** Right-aligned hint, e.g. `J / K · ESC`. */
  hint?: string;
  title: string;
  /** Meta chips under the title. */
  chips?: readonly string[];
  /** Colour of the 4px top border. */
  tone?: SheetTone;
  onClose: () => void;
  closeLabel: string;
  /** Geometry (px) inside the nearest positioned ancestor, which the overlay also fills. */
  left: number;
  width: number;
  top: number;
  height: number;
  /** The 3px `--panel` strip on the shared edge that lets the selected row flow into the sheet. */
  eraserLeft: number;
  eraserTop: number;
  eraserHeight: number;
  /** Footer: leading actions, a flexible mono note, trailing actions. Footer hidden when none given. */
  footerStart?: ReactNode;
  footerNote?: string;
  footerEnd?: ReactNode;
  /** Scrolling body — compose with `SheetSection` / `SheetBlock` / the other detail primitives. */
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A detail sheet pinned beside a row: a dimming overlay (`--bg` 74%, click closes) plus a
 * `--panel` sheet with a 1px ink border, a 4px tone top border, a header (kind · state · hint · ×,
 * title, chips), a scrolling body and an optional footer. Geometry is supplied by the caller
 * (see the Bridge's `measure`). Render inside a `relative` container.
 */
export function AnchoredSheet({
  kind,
  stateLabel,
  hint,
  title,
  chips = [],
  tone = "neutral",
  onClose,
  closeLabel,
  left,
  width,
  top,
  height,
  eraserLeft,
  eraserTop,
  eraserHeight,
  footerStart,
  footerNote,
  footerEnd,
  children,
  ref,
}: AnchoredSheetProps) {
  const hasFooter = footerStart || footerNote || footerEnd;
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-30 bg-[color-mix(in_oklch,var(--color-bg)_74%,transparent)]"
        data-testid={AnchoredSheetTestId.Overlay}
        onClick={onClose}
      />
      <div
        aria-label={title}
        aria-modal="false"
        className={cn(
          "absolute z-[32] box-border flex flex-col border border-ink border-t-4 bg-panel leading-[normal]",
          toneBorderTop[tone],
        )}
        data-testid={AnchoredSheetTestId.Root}
        ref={ref}
        role="dialog"
        style={{ left, top, width, height }}
      >
        <div
          className="absolute w-[3px] bg-panel"
          data-testid={AnchoredSheetTestId.Eraser}
          style={{ left: eraserLeft, top: eraserTop, height: eraserHeight }}
        />
        <div
          className="flex flex-none flex-col gap-[10px] border-b border-line px-[20px] py-[14px]"
          data-testid={AnchoredSheetTestId.Header}
        >
          <div className="flex items-center gap-[10px] font-mono text-[10px] tracking-[.14em] text-ink-3">
            <span className="text-ink-2" data-testid={AnchoredSheetTestId.Kind}>
              {kind}
            </span>
            {stateLabel ? (
              <span className="font-semibold text-ink" data-testid={AnchoredSheetTestId.State}>
                {stateLabel}
              </span>
            ) : null}
            <span className="flex-1" />
            {hint ? <span data-testid={AnchoredSheetTestId.Hint}>{hint}</span> : null}
            <button
              aria-label={closeLabel}
              className="cursor-pointer bg-transparent px-[6px] py-[2px] text-[14px] text-ink-2 hover:text-ink"
              data-testid={AnchoredSheetTestId.Close}
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
          <div
            className="text-[22px] font-medium leading-[1.2] tracking-[-.01em] [text-wrap:pretty]"
            data-testid={AnchoredSheetTestId.Title}
          >
            {title}
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-[6px]">
              {chips.map((c) => (
                <span
                  className="border border-line-2 px-[8px] py-[4px] font-mono text-[10px] tracking-[.1em] text-ink-2"
                  data-testid={AnchoredSheetTestId.Chip}
                  key={c}
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid={AnchoredSheetTestId.Body}>
          {children}
        </div>
        {hasFooter ? (
          <div
            className="flex flex-none flex-wrap items-center gap-[6px] border-t border-line px-[20px] py-[12px] font-mono text-[10px] tracking-[.12em]"
            data-testid={AnchoredSheetTestId.Footer}
          >
            {footerStart}
            <span
              className="min-w-[80px] flex-[1_1_0%] overflow-hidden text-ellipsis whitespace-nowrap px-[8px] text-ink-3"
              data-testid={AnchoredSheetTestId.FooterNote}
            >
              {footerNote}
            </span>
            {/* One unbreakable group: if space runs out the whole group drops to its own
             * line (right-aligned) — the buttons never wrap one by one or mid-label. */}
            {footerEnd ? (
              <div className="ml-auto flex flex-none items-center gap-[6px] whitespace-nowrap">
                {footerEnd}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
