"use client";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export type AlertSeverity = "info" | "ok" | "warn" | "error";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  severity?: AlertSeverity;
  title?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
}

export function Alert({ severity = "info", title, onClose, children, style, ...rest }: AlertProps) {
  const tokens = useTokens();
  const t = tokens.color;

  const palette: Record<AlertSeverity, { fg: string; bg: string; border: string }> = {
    info:  { fg: t.accent.sky,     bg: "rgba(91,141,239,0.10)",  border: "rgba(91,141,239,0.25)" },
    ok:    { fg: t.accent.emerald, bg: "rgba(57,217,138,0.10)",  border: "rgba(57,217,138,0.25)" },
    warn:  { fg: t.accent.warn,    bg: "rgba(240,180,41,0.10)",  border: "rgba(240,180,41,0.25)" },
    error: { fg: t.accent.rose,    bg: "rgba(255,107,107,0.10)", border: "rgba(255,107,107,0.25)" },
  };
  const { fg, bg, border } = palette[severity];

  const computedStyle: CSSProperties = {
    display:         "flex",
    gap:             "10px",
    padding:         "10px 14px",
    borderRadius:    tokens.size.radius,
    backgroundColor: bg,
    borderWidth:     "1px",
    borderStyle:     "solid",
    borderColor:     border,
    color:           fg,
    ...style,
  };

  return (
    <div {...rest} role="alert" style={computedStyle}>
      <div style={{ flex: 1, fontSize: "0.75rem", lineHeight: 1.5 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: "2px" }}>{title}</div>}
        {children}
      </div>
      {onClose && (
        <button
          aria-label="Dismiss"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
