"use client";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export type BadgeTone =
  | "neutral" | "accent" | "ok" | "warn" | "bad" | "run"
  | "opus" | "sonnet" | "haiku";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  solid?: boolean;
  size?: "sm" | "md";
  ref?: Ref<HTMLSpanElement>;
}

export function Badge({
  tone = "neutral",
  solid = false,
  size = "sm",
  style,
  ref,
  children,
  ...rest
}: BadgeProps) {
  const tokens = useTokens();
  const t = tokens.color;

  const toneColors: Record<BadgeTone, { fg: string; bg: string; border: string }> = {
    neutral:  { fg: t.text.secondary,      bg: t.bg.elevated,          border: t.border.default },
    accent:   { fg: t.accent.active,        bg: t.surface.accentSoft,   border: t.accent.activeDim },
    ok:       { fg: t.accent.emerald,       bg: "rgba(57,217,138,0.12)", border: "rgba(57,217,138,0.25)" },
    warn:     { fg: t.accent.warn,          bg: "rgba(240,180,41,0.12)", border: "rgba(240,180,41,0.25)" },
    bad:      { fg: t.accent.rose,          bg: "rgba(255,107,107,0.12)",border: "rgba(255,107,107,0.25)" },
    run:      { fg: t.accent.sky,           bg: "rgba(91,141,239,0.12)", border: "rgba(91,141,239,0.25)" },
    opus:     { fg: t.accent.violet,        bg: "rgba(176,124,255,0.12)",border: "rgba(176,124,255,0.25)" },
    sonnet:   { fg: t.accent.cyan,          bg: "rgba(86,196,214,0.12)", border: "rgba(86,196,214,0.25)" },
    haiku:    { fg: t.accent.green,         bg: "rgba(127,217,138,0.12)",border: "rgba(127,217,138,0.25)" },
  };

  const { fg, bg, border } = toneColors[tone];

  const computedStyle: CSSProperties = {
    display:       "inline-flex",
    alignItems:    "center",
    gap:           "4px",
    fontFamily:    tokens.font.mono,
    fontSize:      size === "sm" ? "0.625rem" : "0.6875rem",
    fontWeight:    600,
    letterSpacing: "0.04em",
    borderRadius:  tokens.size.radiusSm,
    padding:       size === "sm" ? "1px 6px" : "2px 8px",
    color:         fg,
    backgroundColor: solid ? fg : bg,
    borderWidth:   "1px",
    borderStyle:   "solid",
    borderColor:   solid ? "transparent" : border,
    whiteSpace:    "nowrap",
    ...style,
  };

  return (
    <span {...rest} ref={ref} style={computedStyle}>
      {children}
    </span>
  );
}
