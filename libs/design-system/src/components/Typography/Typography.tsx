import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

export type TypographyType =
  | "pageTitle"
  | "title"
  | "subtitle"
  | "text"
  | "note"
  | "num"
  | "data"
  | "label"
  | "micro";

export type TypographyVariant = "primary" | "secondary" | "tertiary";

/** Semantic colour override, takes precedence over `variant`. */
export type TypographyTone = "ok" | "bad" | "warn" | "run" | "accent";

export type TypographySize =
  | "2xs"
  | "xs"
  | "sm"
  | "caption"
  | "base"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl";

export type TypographyWeight = "normal" | "medium" | "semibold" | "bold";

export type TypographyTracking = "tighter" | "normal" | "wide" | "wider" | "widest" | "mono";

export type TypographyLeading = "tight" | "snug" | "normal" | "relaxed";

export type TypographyAlign = "left" | "center" | "right";

export enum TypographyTestId {
  Root = "typography-root",
}

type As = "h1" | "h2" | "h3" | "div" | "p" | "span" | "label";

interface TypePreset {
  tag: As;
  size: TypographySize;
  weight: TypographyWeight;
  leading: number;
  mono?: boolean;
  uppercase?: boolean;
  tracking?: TypographyTracking;
  variant?: TypographyVariant;
}

/**
 * The 8-step scale: display 30 · title 21 · body 14 · bodySm 13 ·
 * num 26 · data 12 · label 11 · micro 11 — mono = data, sans = prose.
 */
const typePreset: Record<TypographyType, TypePreset> = {
  pageTitle: { tag: "h1", size: "5xl", weight: "semibold", leading: 1.2, tracking: "tighter" },
  title: { tag: "h2", size: "3xl", weight: "semibold", leading: 1.25, tracking: "tighter" },
  subtitle: { tag: "h3", size: "2xl", weight: "medium", leading: 1.3 },
  text: { tag: "div", size: "lg", weight: "normal", leading: 1.6 },
  note: { tag: "div", size: "caption", weight: "normal", leading: 1.5 },
  num: { tag: "span", size: "4xl", weight: "semibold", leading: 1, mono: true },
  data: {
    tag: "span",
    size: "sm",
    weight: "normal",
    leading: 1.6,
    mono: true,
    variant: "secondary",
  },
  label: {
    tag: "span",
    size: "xs",
    weight: "medium",
    leading: 1.2,
    mono: true,
    uppercase: true,
    tracking: "wider",
    variant: "tertiary",
  },
  micro: {
    tag: "span",
    size: "xs",
    weight: "normal",
    leading: 1.5,
    mono: true,
    variant: "tertiary",
  },
};

const variantClass: Record<TypographyVariant, string> = {
  primary: "text-foreground",
  secondary: "text-foreground-dim",
  tertiary: "text-foreground-faint",
};

const toneClass: Record<TypographyTone, string> = {
  ok: "text-ok",
  bad: "text-bad",
  warn: "text-warn",
  run: "text-run",
  accent: "text-accent",
};

const weightClass: Record<TypographyWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const leadingValue: Record<TypographyLeading, number> = {
  tight: 1.2,
  snug: 1.3,
  normal: 1.4,
  relaxed: 1.6,
};

export interface TypographyProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  /** Preset that drives the default tag, size, weight and leading. */
  type: TypographyType;
  /** Neutral foreground level. */
  variant?: TypographyVariant;
  /** Semantic colour; overrides `variant` when set. */
  tone?: TypographyTone;
  mono?: boolean;
  /** Override the preset font size. */
  size?: TypographySize;
  /** Override the preset font weight. */
  weight?: TypographyWeight;
  tracking?: TypographyTracking;
  leading?: TypographyLeading;
  uppercase?: boolean;
  truncate?: boolean;
  nowrap?: boolean;
  align?: TypographyAlign;
  /** Override the rendered element. */
  as?: As;
  ref?: Ref<HTMLElement>;
}

export function Typography({
  type,
  variant,
  tone,
  mono,
  size,
  weight,
  tracking,
  leading,
  uppercase,
  truncate,
  nowrap,
  align,
  as,
  style,
  ref,
  ...rest
}: TypographyProps) {
  const preset = typePreset[type];
  const Element = as ?? preset.tag;
  const resolvedTracking = tracking ?? preset.tracking;

  const computedStyle: CSSProperties = {
    fontSize: `var(--text-${size ?? preset.size})`,
    lineHeight: leading ? leadingValue[leading] : preset.leading,
    ...(resolvedTracking ? { letterSpacing: `var(--tracking-${resolvedTracking})` } : {}),
    ...(align ? { textAlign: align } : {}),
    ...style,
  };

  return (
    <Element
      className={cn(
        weightClass[weight ?? preset.weight],
        tone ? toneClass[tone] : variantClass[variant ?? preset.variant ?? "primary"],
        (mono ?? preset.mono) && "font-mono",
        (uppercase ?? preset.uppercase) && "uppercase",
        truncate && "truncate",
        nowrap && "whitespace-nowrap",
      )}
      data-testid={TypographyTestId.Root}
      ref={
        ref as Ref<
          HTMLHeadingElement &
            HTMLDivElement &
            HTMLParagraphElement &
            HTMLSpanElement &
            HTMLLabelElement
        >
      }
      style={computedStyle}
      {...rest}
    />
  );
}
