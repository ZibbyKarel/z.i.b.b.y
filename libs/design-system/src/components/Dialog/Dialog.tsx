"use client";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Footer actions slot. */
  actions?: ReactNode;
  width?: string;
  className?: string;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  width = "460px",
  className,
  children,
}: DialogProps) {
  const tokens = useTokens();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap focus & scroll lock
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

  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(2px)",
  };

  const panelStyle: CSSProperties = {
    position:        "relative",
    width:           width,
    maxWidth:        "calc(100vw - 32px)",
    maxHeight:       "calc(100vh - 64px)",
    display:         "flex",
    flexDirection:   "column",
    backgroundColor: tokens.color.bg.elevated,
    borderWidth:     "1px",
    borderStyle:     "solid",
    borderColor:     tokens.color.border.strong,
    borderRadius:    tokens.size.radius,
    boxShadow:       tokens.size.shadowModal,
    animation:       "scale-in 0.14s ease-out",
    outline:         "none",
  };

  return (
    <div
      style={backdropStyle}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        style={panelStyle}
        className={className}
      >
        {title && <DialogHeader title={title} description={description} onClose={onClose} />}
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
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
}) {
  const tokens = useTokens();
  return (
    <div
      style={{
        padding:      "16px 20px 14px",
        borderBottom: `1px solid ${tokens.color.border.default}`,
        flexShrink:   0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <span style={{ fontFamily: tokens.font.mono, fontWeight: 600, fontSize: "0.8125rem", color: tokens.color.text.primary }}>
          {title}
        </span>
        {onClose && (
          <button
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background:   "none",
              border:       "none",
              cursor:       "pointer",
              color:        tokens.color.text.tertiary,
              padding:      "2px",
              lineHeight:   1,
              fontSize:     "1rem",
            }}
          >
            ✕
          </button>
        )}
      </div>
      {description && (
        <p style={{ marginTop: "6px", fontSize: "0.75rem", color: tokens.color.text.secondary, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
    </div>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{ padding: "16px 20px", overflowY: "auto", flex: "1 1 auto" }}
    >
      {children}
    </div>
  );
}

function DialogFooter({ children }: { children: ReactNode }) {
  const tokens = useTokens();
  return (
    <div
      style={{
        padding:      "12px 20px 16px",
        borderTop:    `1px solid ${tokens.color.border.default}`,
        display:      "flex",
        justifyContent: "flex-end",
        gap:          "8px",
        flexShrink:   0,
      }}
    >
      {children}
    </div>
  );
}
