"use client";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Row } from "../Stack/Stack";

export type DialogWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

export enum DialogTestId {
  Overlay = "dialog-overlay",
  Root = "dialog-root",
  Header = "dialog-header",
  Title = "dialog-title",
  Description = "dialog-description",
  CloseButton = "dialog-close-button",
  Body = "dialog-body",
  Footer = "dialog-footer",
}

const dialogWidthPx: Record<DialogWidth, string> = {
  sm: "360px",
  md: "460px",
  lg: "600px",
  xl: "800px",
  "2xl": "1000px",
  // Near-viewport canvas modal (e.g. the pipeline node-graph editor). Capped by
  // the shared `maxWidth: calc(100vw - 32px)` so it never overflows the screen.
  full: "1320px",
};

/**
 * `full` also takes a definite height so a flex-`1` body can host a scrollable
 * canvas; every other width hugs its content (height left unset).
 */
const dialogHeight: Partial<Record<DialogWidth, string>> = {
  full: "min(860px, calc(100vh - 80px))",
};

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  width?: DialogWidth;
  /** Accessible name override (use when `title` is non-string content). */
  ariaLabel?: string;
  /** Accessible label for the header close button. */
  closeLabel?: string;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  width = "md",
  ariaLabel,
  closeLabel = "Close dialog",
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const prev = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        // The opener may have unmounted while the dialog was up.
        if (prev?.isConnected) prev.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] backdrop-blur-sm"
      data-testid={DialogTestId.Overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="presentation"
    >
      <div
        aria-modal
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        className="relative flex max-h-[calc(100vh-64px)] flex-col bg-elevated border border-border-strong rounded-lg shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_13%,transparent),var(--shadow-modal)] animate-scale-in outline-none"
        data-testid={DialogTestId.Root}
        ref={dialogRef}
        role="dialog"
        style={{ width: dialogWidthPx[width], maxWidth: "calc(100vw - 32px)", height: dialogHeight[width] }}
        tabIndex={-1}
      >
        {title && <DialogHeader closeLabel={closeLabel} description={description} onClose={onClose} title={title} />}
        {children && <DialogBody>{children}</DialogBody>}
        {actions && <DialogFooter>{actions}</DialogFooter>}
      </div>
    </div>
  );
}

function DialogHeader({
  title,
  description,
  onClose,
  closeLabel = "Close dialog",
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="px-5 pt-4 pb-[14px] border-b border-border shrink-0" data-testid={DialogTestId.Header}>
      <Row gap="150" justify="between">
        <div className="font-mono font-semibold text-md text-foreground" data-testid={DialogTestId.Title}>{title}</div>
        {onClose && (
          <button
            aria-label={closeLabel}
            className={cn(
              "bg-transparent border-none cursor-pointer text-foreground-faint p-0.5 leading-none text-base hover:text-foreground",
              focusRing,
            )}
            data-testid={DialogTestId.CloseButton}
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </Row>
      {description && (
        <p className="mt-1.5 text-base text-foreground-dim leading-relaxed" data-testid={DialogTestId.Description}>{description}</p>
      )}
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-4 overflow-y-auto flex-1" data-testid={DialogTestId.Body}>
      {children}
    </div>
  );
}

function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 pt-3 pb-4 border-t border-border shrink-0" data-testid={DialogTestId.Footer}>
      <Row gap="100" justify="end">{children}</Row>
    </div>
  );
}
