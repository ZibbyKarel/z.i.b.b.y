"use client";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { useOverlayStack } from "../../hooks/useOverlayStack";
import { Button } from "../Button/Button";
import { Typography } from "../Typography/Typography";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Edge the sheet is anchored to — `"right"` only today; kept as a union so a
 *  future edge (e.g. `"bottom"` for a mobile sheet) is additive, not a rename. */
export type SheetSide = "right";

/** Sealed width presets, distinct from {@link DialogWidth} — a Sheet is an
 *  edge-anchored panel, not a centred modal (I-5). */
export type SheetWidth = "sm" | "md" | "lg" | "xl";

const sheetWidthPx: Record<SheetWidth, string> = {
  sm: "360px",
  md: "460px",
  lg: "560px",
  xl: "720px",
};

export enum SheetTestId {
  Overlay = "sheet-overlay",
  Root = "sheet-root",
  Header = "sheet-header",
  Title = "sheet-title",
  CloseButton = "sheet-close-button",
  Body = "sheet-body",
  Footer = "sheet-footer",
}

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  side?: SheetSide;
  width?: SheetWidth;
  title?: ReactNode;
  footer?: ReactNode;
  /** Accessible name override (use when `title` is non-string content). */
  ariaLabel?: string;
  /** Accessible label for the header close button. */
  closeLabel?: string;
  children?: ReactNode;
}

/**
 * A right-edge slide-in panel (DS App mock's "Approval sheet") — full viewport
 * height, hairline `--ink` border on its leading edge, its own focus
 * trap/Escape/overlay-stack wiring (mirrors {@link Dialog}'s internals almost
 * verbatim). Deliberately NOT a `Dialog`: a Sheet is anchored to an edge and
 * hosts detail/editing for an object the operator is still looking at
 * (approval detail, pipeline editing) — `Dialog` stays reserved for
 * create/confirm (I-5).
 */
export function Sheet({
  open,
  onClose,
  side = "right",
  width = "md",
  title,
  footer,
  ariaLabel,
  closeLabel = "Close panel",
  children,
}: SheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { isTopmost } = useOverlayStack(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const container = rootRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        e.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, isTopmost]);

  useEffect(() => {
    if (open) {
      const prev = document.activeElement as HTMLElement | null;
      rootRef.current?.focus();
      return () => {
        // The opener may have unmounted while the sheet was up.
        if (prev?.isConnected) prev.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[var(--color-overlay)]"
      data-testid={SheetTestId.Overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        aria-modal
        aria-label={ariaLabel}
        aria-labelledby={title && !ariaLabel ? titleId : undefined}
        className={cn("relative flex h-full flex-col bg-panel border-ink", focusRing)}
        data-side={side}
        data-testid={SheetTestId.Root}
        ref={rootRef}
        role="dialog"
        style={{
          width: sheetWidthPx[width],
          maxWidth: "calc(100vw - 32px)",
          borderLeftWidth: side === "right" ? 1 : undefined,
          borderLeftStyle: side === "right" ? "solid" : undefined,
        }}
        tabIndex={-1}
      >
        {title && (
          <div
            className="flex shrink-0 items-center gap-3.5 border-b border-line px-5 py-4"
            data-testid={SheetTestId.Header}
          >
            <Typography
              truncate
              data-testid={SheetTestId.Title}
              id={titleId}
              style={{ flex: 1, minWidth: 0 }}
              type="h3"
            >
              {title}
            </Typography>
            {onClose && (
              <Button
                aria-label={closeLabel}
                data-testid={SheetTestId.CloseButton}
                icon="x"
                intent="ghost"
                onClick={onClose}
                size="sm"
              />
            )}
          </div>
        )}
        {children && (
          <div className="flex-1 overflow-y-auto p-5" data-testid={SheetTestId.Body}>
            {children}
          </div>
        )}
        {footer && (
          <div className="shrink-0 border-t border-line p-5" data-testid={SheetTestId.Footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
