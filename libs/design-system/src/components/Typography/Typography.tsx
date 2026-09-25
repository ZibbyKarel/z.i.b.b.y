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
  | "micro"
  // DS.md §3.1/§3.2 — added additively alongside the pre-ZibbyCorp presets above
  // (which stay for existing callers; `title`/`label` are updated in place below).
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "bodyLg"
  | "body"
  | "bodySm"
  | "caption"
  | "metric"
  | "wordmark"
  | "labelSm"
  | "code";

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
  /** A named token on the existing `--text-*` scale. Omit when the preset needs an
   *  exact DS.md §3 px value the named scale doesn't carry — use {@link fontSizePx}. */
  size?: TypographySize;
  /** Exact px size (DS.md §3.1/§3.2) for a preset that doesn't fit the named `size`
   *  scale. Takes precedence over `size` when both would apply; ignored if the
   *  caller passes an explicit `size` prop. */
  fontSizePx?: number;
  weight: TypographyWeight;
  leading: number;
  mono?: boolean;
  uppercase?: boolean;
  tracking?: TypographyTracking;
  /** Exact em letter-spacing (DS.md §3) for a preset whose tracking value doesn't
   *  match a named `--tracking-*` token. Takes precedence over `tracking`. */
  letterSpacingEm?: number;
  /** `font-variant-numeric: tabular-nums` — DS.md's `metric` preset (stat values). */
  tabularNums?: boolean;
  variant?: TypographyVariant;
}

/**
 * The 8-step scale: display 30 · title 21 · body 14 · bodySm 13 ·
 * num 26 · data 12 · label 11 · micro 11 — mono = data, sans = prose.
 */
const typePreset: Record<TypographyType, TypePreset> = {
  pageTitle: { tag: "h1", size: "5xl", weight: "semibold", leading: 1.2, tracking: "tighter" },
  // DS.md §3.1 `title` (16 / 1.35, weight 500, tracking 0) — size/weight/leading/
  // tracking updated in place; `tag` is left as `h2` (unchanged) since the new §3.1
  // heading trio (`h1`/`h2`/`h3` below) now owns the heading semantics and this stays
  // a scoped, size-only update — see the ZA-01 report.
  title: { tag: "h2", fontSizePx: 16, weight: "medium", leading: 1.35, letterSpacingEm: 0 },
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
  // DS.md §3.2 `label` (11 / 400–600, tracking 0.14em) — already matched by the
  // existing `xs` / `wider` tokens (11px, 0.14em); left as-is bar this note.
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

  // --- DS.md §3.1 sans scale (added additively) ---
  display: {
    tag: "h1",
    fontSizePx: 32,
    weight: "medium",
    leading: 1.1,
    letterSpacingEm: -0.02,
  },
  h1: { tag: "h1", fontSizePx: 30, weight: "medium", leading: 1.1, letterSpacingEm: -0.02 },
  h2: { tag: "h2", fontSizePx: 24, weight: "medium", leading: 1.2, letterSpacingEm: -0.01 },
  h3: { tag: "h3", fontSizePx: 18, weight: "medium", leading: 1.3, letterSpacingEm: 0 },
  bodyLg: { tag: "div", fontSizePx: 15, weight: "normal", leading: 1.35, letterSpacingEm: 0 },
  body: { tag: "div", fontSizePx: 14, weight: "normal", leading: 1.45, letterSpacingEm: 0 },
  bodySm: { tag: "div", fontSizePx: 13, weight: "normal", leading: 1.35, letterSpacingEm: 0 },
  caption: {
    tag: "div",
    fontSizePx: 12,
    weight: "normal",
    leading: 1.4,
    letterSpacingEm: 0,
    variant: "secondary",
  },
  metric: {
    tag: "span",
    fontSizePx: 20,
    weight: "medium",
    leading: 1.1,
    letterSpacingEm: 0,
    tabularNums: true,
  },

  // --- DS.md §3.2 mono scale (system voice, uppercase unless noted) ---
  wordmark: {
    tag: "span",
    fontSizePx: 13,
    weight: "semibold",
    leading: 1.2,
    mono: true,
    uppercase: true,
    letterSpacingEm: 0.18,
  },
  labelSm: {
    tag: "span",
    fontSizePx: 10,
    weight: "normal",
    leading: 1.2,
    mono: true,
    uppercase: true,
    letterSpacingEm: 0.12,
    variant: "tertiary",
  },
  // Agent names, IDs, log lines — deliberately NOT uppercased (DS.md §3.2).
  code: {
    tag: "span",
    fontSizePx: 11,
    weight: "normal",
    leading: 1.3,
    mono: true,
    letterSpacingEm: 0.1,
    variant: "secondary",
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

  // A caller-supplied `size`/`tracking` always wins (named-token overrides); otherwise
  // an exact DS.md px value (`fontSizePx`/`letterSpacingEm`) wins over a named token,
  // since it's how a preset like `display`/`h1`/`metric` expresses a size the
  // `--text-*`/`--tracking-*` scales don't carry — see `TypePreset`.
  const resolvedFontSize = size
    ? `var(--text-${size})`
    : (preset.fontSizePx ?? preset.size)
      ? preset.fontSizePx !== undefined
        ? `${preset.fontSizePx}px`
        : `var(--text-${preset.size})`
      : undefined;
  const resolvedLetterSpacing = tracking
    ? `var(--tracking-${tracking})`
    : preset.letterSpacingEm !== undefined
      ? `${preset.letterSpacingEm}em`
      : preset.tracking
        ? `var(--tracking-${preset.tracking})`
        : undefined;

  const computedStyle: CSSProperties = {
    fontSize: resolvedFontSize,
    lineHeight: leading ? leadingValue[leading] : preset.leading,
    ...(resolvedLetterSpacing ? { letterSpacing: resolvedLetterSpacing } : {}),
    ...(preset.tabularNums ? { fontVariantNumeric: "tabular-nums" } : {}),
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
