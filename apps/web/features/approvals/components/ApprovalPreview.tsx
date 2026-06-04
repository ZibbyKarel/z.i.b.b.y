import type { ReactNode } from "react";
import { Icon, type IconName, Typography } from "@zibby/design-system";
import type { ApprovalPreview as Preview } from "../approval";

const MONO = "var(--font-mono, ui-monospace, monospace)";

/** Framed preview surface with a header bar — the shell every preview kind shares. */
function PreviewShell({
  icon,
  label,
  meta,
  children,
}: {
  icon: IconName;
  label: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        overflow: "hidden",
        background: "var(--color-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          padding: "0.55rem 0.8rem",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <Icon name={icon} size="sm" tone="accent" />
        <Typography mono size="xs" type="note" weight="semibold">
          {label}
        </Typography>
        {meta && (
          <span style={{ marginLeft: "auto" }}>
            <Typography mono size="2xs" type="note" variant="tertiary">
              {meta}
            </Typography>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const DIFF_KIND = {
  add: { color: "var(--color-ok)", bg: "rgba(127,217,138,0.09)", sign: "+" },
  del: { color: "var(--color-bad)", bg: "rgba(255,107,107,0.09)", sign: "−" },
  ctx: { color: "var(--color-foreground-dim)", bg: "transparent", sign: " " },
} as const;

export interface ApprovalPreviewProps {
  preview: Preview;
  /** Localized "total to pay" / "delete targets" captions. */
  labels: { cart: string; total: string; targets: string; sendTo: string };
}

/** Renders the exact action an agent is about to take, by preview kind. */
export function ApprovalPreview({ preview, labels }: ApprovalPreviewProps) {
  if (preview.kind === "cart") {
    return (
      <PreviewShell icon="cart" label={labels.cart} meta={preview.meta}>
        <div>
          {preview.items.map(([name, price], i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.5rem 0.8rem",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <Typography size="sm" type="text" variant={name.startsWith("+") ? "tertiary" : "secondary"}>
                {name}
              </Typography>
              <Typography mono size="sm" type="note">
                {price}
              </Typography>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "0.75rem 0.8rem",
            background: "rgba(240,180,41,0.06)",
          }}
        >
          <Typography mono uppercase size="xs" type="note" variant="secondary">
            {labels.total}
          </Typography>
          <Typography mono size="lg" tone="warn" type="note" weight="bold">
            {preview.total}
          </Typography>
        </div>
      </PreviewShell>
    );
  }

  if (preview.kind === "diff") {
    return (
      <PreviewShell icon="branch" label={preview.file} meta={preview.meta}>
        {preview.hunks.map((hunk, hi) => (
          <div key={hi}>
            <div
              style={{
                padding: "0.35rem 0.8rem",
                fontFamily: MONO,
                fontSize: 11,
                color: "var(--color-accent)",
                background: "var(--color-accent-dim)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {hunk.h}
            </div>
            {hunk.lines.map(([kind, text], i) => {
              const m = DIFF_KIND[kind];
              return (
                <div
                  key={i}
                  style={{ display: "flex", background: m.bg, fontFamily: MONO, fontSize: 11.5, lineHeight: 1.7 }}
                >
                  <span
                    style={{ width: 22, flex: "0 0 auto", textAlign: "center", color: m.color, opacity: 0.7, userSelect: "none" }}
                  >
                    {m.sign}
                  </span>
                  <span style={{ color: kind === "ctx" ? "var(--color-foreground-dim)" : m.color, whiteSpace: "pre", paddingRight: "0.8rem" }}>
                    {text || " "}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </PreviewShell>
    );
  }

  if (preview.kind === "command") {
    return (
      <PreviewShell icon="server" label={`${preview.shell}`} meta={preview.note}>
        <div style={{ padding: "0.8rem", fontFamily: MONO, fontSize: 12.5, lineHeight: 1.6 }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <span style={{ color: "var(--color-bad)", flex: "0 0 auto" }}>$</span>
            <span style={{ color: "var(--color-foreground)", whiteSpace: "pre-wrap" }}>{preview.cmd}</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--color-border)", padding: "0.6rem 0.8rem" }}>
          <Typography mono uppercase size="2xs" type="note" variant="tertiary">
            {labels.targets}
          </Typography>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.45rem" }}>
            {preview.targets.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Icon name="x" size="xs" tone="bad" />
                <Typography mono size="xs" type="note" variant={t.startsWith("…") ? "tertiary" : "secondary"}>
                  {t}
                </Typography>
              </div>
            ))}
          </div>
        </div>
      </PreviewShell>
    );
  }

  // message
  return (
    <PreviewShell icon="arrow" label={`${labels.sendTo} ${preview.to}`} meta={preview.subject}>
      <div style={{ padding: "0.9rem 1rem" }}>
        <Typography leading="relaxed" size="base" style={{ whiteSpace: "pre-wrap" }} type="text">
          {preview.body}
        </Typography>
      </div>
    </PreviewShell>
  );
}
