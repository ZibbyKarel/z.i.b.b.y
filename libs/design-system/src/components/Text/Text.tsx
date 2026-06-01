"use client";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export type TextSize =
  | "2xs" | "xs" | "sm" | "caption" | "base" | "md"
  | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";

export type TextTone =
  | "default" | "secondary" | "tertiary" | "muted"
  | "accent" | "ok" | "warn" | "bad";

export type TextWeight = "normal" | "medium" | "semibold" | "bold";
export type TextFont   = "sans" | "mono";

const fontSizeMap: Record<TextSize, string> = {
  "2xs": "0.5rem",   "xs": "0.5625rem", "sm": "0.625rem",
  caption: "0.6875rem", base: "0.75rem", md: "0.8125rem",
  lg: "0.875rem",    xl: "0.9375rem",   "2xl": "1.0625rem",
  "3xl": "1.25rem",  "4xl": "1.375rem", "5xl": "1.6875rem",
};

const lineHeightMap: Record<TextSize, string> = {
  "2xs": "1.25", "xs": "1.3", "sm": "1.4", caption: "1.4",
  base: "1.5", md: "1.5", lg: "1.4", xl: "1.35",
  "2xl": "1.3", "3xl": "1.25", "4xl": "1.2", "5xl": "1.2",
};

const weightMap: Record<TextWeight, number> = {
  normal: 400, medium: 500, semibold: 600, bold: 700,
};

type As = "span" | "p" | "div" | "label" | "strong" | "em" | "small" | "time" | "address";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: As;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  font?: TextFont;
  truncate?: boolean;
  tracking?: "tighter" | "normal" | "wide" | "wider" | "widest" | "mono";
  ref?: Ref<HTMLElement>;
}

const trackingMap: Record<NonNullable<TextProps["tracking"]>, string> = {
  tighter: "-0.01em", normal: "0",    wide: "0.04em",
  wider: "0.1em",     widest: "0.18em", mono: "0.3em",
};

export function Text({
  as: Tag = "span",
  size,
  tone,
  weight,
  font,
  truncate,
  tracking,
  style,
  ref,
  ...rest
}: TextProps) {
  const tokens = useTokens();

  function resolveColor(): string | undefined {
    if (!tone || tone === "default") return undefined; // inherit
    const m: Record<Exclude<TextTone,"default">, string> = {
      secondary: tokens.color.text.secondary,
      tertiary:  tokens.color.text.tertiary,
      muted:     tokens.color.text.muted,
      accent:    tokens.color.accent.active,
      ok:        tokens.color.accent.emerald,
      warn:      tokens.color.accent.warn,
      bad:       tokens.color.accent.rose,
    };
    return m[tone as Exclude<TextTone,"default">];
  }

  const computedStyle: CSSProperties = {
    fontSize:      size ? fontSizeMap[size] : undefined,
    lineHeight:    size ? lineHeightMap[size] : undefined,
    fontWeight:    weight ? weightMap[weight] : undefined,
    fontFamily:    font === "mono" ? tokens.font.mono : (font === "sans" ? tokens.font.sans : undefined),
    color:         resolveColor(),
    letterSpacing: tracking ? trackingMap[tracking] : undefined,
    overflow:      truncate ? "hidden" : undefined,
    textOverflow:  truncate ? "ellipsis" : undefined,
    whiteSpace:    truncate ? "nowrap" : undefined,
    ...style,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Tag {...(rest as any)} ref={ref as Ref<HTMLElement>} style={computedStyle} />;
}

// Heading variant
export type HeadingLevel = 1 | 2 | 3 | 4;

export interface HeadingProps extends Omit<TextProps, "as"> {
  level?: HeadingLevel;
  ref?: Ref<HTMLHeadingElement>;
}

export function Heading({ level = 2, size, ref, ...rest }: HeadingProps) {
  const defaultSize: Record<HeadingLevel, TextSize> = { 1: "4xl", 2: "2xl", 3: "xl", 4: "lg" };
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  return <Text as={Tag as As} size={size ?? defaultSize[level]} weight="semibold" ref={ref as Ref<HTMLElement>} {...rest} />;
}
