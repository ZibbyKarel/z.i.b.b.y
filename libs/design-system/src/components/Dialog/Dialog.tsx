"use client";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Row } from "../Stack/Stack";

export type DialogWidth = "sm" | "md" | "lg" | "xl";

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
        prev?.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid={DialogTestId.Overlay}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.55)] backdrop-blur-sm"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        data-testid={DialogTestId.Root}
        role="dialog"
        aria-modal
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
        tabIndex={-1}
        style={{ width: dialogWidthPx[width], maxWidth: "calc(100vw - 32px)" }}
        className="relative flex max-h-[calc(100vh-64px)] flex-col bg-elevated border border-border-strong rounded shadow-modal animate-scale-in outline-none"
      >
        {title && <DialogHeader title={title} description={description} onClose={onClose} closeLabel={closeLabel} />}
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
    <div data-testid={DialogTestId.Header} className="px-5 pt-4 pb-[14px] border-b border-border shrink-0">
      <Row justify="between" gap="150">
        <div data-testid={DialogTestId.Title} className="font-mono font-semibold text-md text-foreground">{title}</div>
        {onClose && (
          <button
            data-testid={DialogTestId.CloseButton}
            aria-label={closeLabel}
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-foreground-faint p-0.5 leading-none text-base outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        )}
      </Row>
      {description && (
        <p data-testid={DialogTestId.Description} className="mt-1.5 text-base text-foreground-dim leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export function DialogBody({ children }: { children: ReactNode }) {
  return (
    <div data-testid={DialogTestId.Body} className="px-5 py-4 overflow-y-auto flex-1">
      {children}
    </div>
  );
}

function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div data-testid={DialogTestId.Footer} className="px-5 pt-3 pb-4 border-t border-border shrink-0">
      <Row justify="end" gap="100">{children}</Row>
    </div>
  );
}
