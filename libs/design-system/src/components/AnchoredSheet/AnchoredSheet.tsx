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
  TitleLink = "anchored-sheet-title-link",
  Actions = "anchored-sheet-actions",
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
  /** Makes the title a link-style button (e.g. open the full page of what the sheet shows). */
  onTitleClick?: () => void;
  /** Title opens this URL in a new tab (wins over `onTitleClick`). */
  titleHref?: string;
  /**
   * The sheet's ONLY action slot: right of the title, top-right of the sheet. Every sheet puts
   * its buttons here so they sit in the same place whatever the body shows. Wraps as one group.
   */
  actions?: ReactNode;
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
  /** Mono status note in the footer (no actions — those go in `actions`). Footer hidden when absent. */
  footerNote?: string;
  /** Free-form footer (an inline form, e.g. a reject reason) — rendered full-width instead of the note. */
  footer?: ReactNode;
  /** Scrolling body — compose with `SheetSection` / `SheetBlock` / the other detail primitives. */
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A detail sheet pinned beside a row: a dimming overlay (`--bg` 74%, click closes) plus a
 * `--panel` sheet with a 1px ink border, a 4px tone top border, a header (kind · state · hint · ×,
 * title + actions top-right, chips), a scrolling body and an optional footer note. Geometry is supplied by the caller
 * (see the Bridge's `measure`). Render inside a `relative` container.
 */
export function AnchoredSheet({
  kind,
  stateLabel,
  hint,
  title,
  onTitleClick,
  titleHref,
  actions,
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
  footerNote,
  footer,
  children,
  ref,
}: AnchoredSheetProps) {
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
          <div className="flex items-center gap-[10px] font-sans uppercase tracking-wider text-[10px] text-ink-3">
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
          <div className="flex items-start gap-[12px]">
            <div
              className="min-w-0 flex-1 text-[22px] font-medium leading-[1.2] tracking-[-.01em] [text-wrap:pretty]"
              data-testid={AnchoredSheetTestId.Title}
            >
              {titleHref ? (
                <a
                  className="hover:underline"
                  data-testid={AnchoredSheetTestId.TitleLink}
                  href={titleHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {title}
                </a>
              ) : onTitleClick ? (
                <button
                  className="cursor-pointer bg-transparent p-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] tracking-[inherit] hover:underline"
                  onClick={onTitleClick}
                  type="button"
                >
                  {title}
                </button>
              ) : (
                title
              )}
            </div>
            {actions ? (
              <div
                className="flex flex-none flex-wrap items-center gap-[6px] font-sans text-[12px]"
                data-testid={AnchoredSheetTestId.Actions}
              >
                {actions}
              </div>
            ) : null}
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-[6px]">
              {chips.map((c) => (
                <span
                  className="rounded-sm border border-line-2 px-[8px] py-[4px] font-sans uppercase tracking-wider text-[10px] text-ink-2"
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
        {footer ? (
          <div
            className="flex-none border-t border-line px-[20px] py-[12px]"
            data-testid={AnchoredSheetTestId.Footer}
          >
            {footer}
          </div>
        ) : footerNote ? (
          <div
            className="flex-none overflow-hidden text-ellipsis whitespace-nowrap border-t border-line px-[20px] py-[12px] font-sans text-[12px] text-ink-3"
            data-testid={AnchoredSheetTestId.Footer}
          >
            <span data-testid={AnchoredSheetTestId.FooterNote}>{footerNote}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
