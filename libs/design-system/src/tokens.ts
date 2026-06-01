/**
 * z.i.b.b.y design token system.
 *
 * TypeScript types + token objects are the single source of visual truth.
 * The DesignSystemProvider translates these into inline CSS custom properties;
 * globals.css @theme maps Tailwind utility namespaces onto those same vars.
 */

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/** Named spacing scale. Maps to px: 0/2/4/6/8/12/16/20/24/28/32/36/40 */
export type Spacing =
  | "0"
  | "25"
  | "50"
  | "75"
  | "100"
  | "150"
  | "200"
  | "250"
  | "300"
  | "350"
  | "400"
  | "450"
  | "500";

export type Padding =
  | Spacing
  | [Spacing, Spacing]
  | [Spacing, Spacing, Spacing, Spacing];

export type Size = "xs" | "sm" | "md" | "lg" | "xl";

export const spacingValues: Record<Spacing, string> = {
  "0": "0px",
  "25": "2px",
  "50": "4px",
  "75": "6px",
  "100": "8px",
  "150": "12px",
  "200": "16px",
  "250": "20px",
  "300": "24px",
  "350": "28px",
  "400": "32px",
  "450": "36px",
  "500": "40px",
};

export function spacingToPx(token: Spacing): string {
  return spacingValues[token];
}

export function resolvePadding(
  p: Padding,
): [Spacing, Spacing, Spacing, Spacing] {
  if (typeof p === "string") return [p, p, p, p];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
}

// ---------------------------------------------------------------------------
// Color tokens
// ---------------------------------------------------------------------------

export interface ColorTokens {
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    muted: string;
  };
  bg: {
    canvas: string;
    surface: string;
    elevated: string;
    raised: string;
    hover: string;
  };
  border: {
    default: string;
    strong: string;
  };
  /**
   * Semantic accent palette. `amber` = home accent, `sky` = work accent.
   * The active accent is selected by `contextTokens(context)` override.
   */
  accent: {
    /** Active context accent (default: amber/home). */
    active: string;
    /** Dimmed accent surface (e.g. bg-accent-dim). */
    activeDim: string;
    /** Contrast color on accent background. */
    activeContrast: string;
    /** Glow color for accent box-shadow. */
    activeGlow: string;
    /** Home context accent (amber). */
    amber: string;
    /** Work context accent (sky/blue). */
    sky: string;
    /** Success / ok. */
    emerald: string;
    /** Danger / error. */
    rose: string;
    /** Warning (shares amber). */
    warn: string;
    /** Opus model badge. */
    violet: string;
    /** Sonnet model badge. */
    cyan: string;
    /** Haiku model badge. */
    green: string;
  };
  surface: {
    accentSoft: string;
    accentRing: string;
  };
}

// ---------------------------------------------------------------------------
// Size tokens
// ---------------------------------------------------------------------------

export interface SizeTokens {
  radius: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;
  shadowSm: string;
  shadowLg: string;
  shadowCard: string;
  shadowModal: string;
  shadowGlow: string;
}

// ---------------------------------------------------------------------------
// Font tokens
// ---------------------------------------------------------------------------

export interface FontTokens {
  sans: string;
  mono: string;
}

// ---------------------------------------------------------------------------
// Composed DesignTokens
// ---------------------------------------------------------------------------

export interface DesignTokens {
  color: ColorTokens;
  size: SizeTokens;
  font: FontTokens;
}

export type PartialDesignTokens = {
  color?: Partial<{
    text: Partial<ColorTokens["text"]>;
    bg: Partial<ColorTokens["bg"]>;
    border: Partial<ColorTokens["border"]>;
    accent: Partial<ColorTokens["accent"]>;
    surface: Partial<ColorTokens["surface"]>;
  }>;
  size?: Partial<SizeTokens>;
  font?: Partial<FontTokens>;
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Deep-merge a partial token override onto a base token set. */
export function mergeTokens(
  base: DesignTokens,
  override: PartialDesignTokens,
): DesignTokens {
  return {
    color: {
      text: { ...base.color.text, ...override.color?.text },
      bg: { ...base.color.bg, ...override.color?.bg },
      border: { ...base.color.border, ...override.color?.border },
      accent: { ...base.color.accent, ...override.color?.accent },
      surface: { ...base.color.surface, ...override.color?.surface },
    },
    size: { ...base.size, ...override.size },
    font: { ...base.font, ...override.font },
  };
}

/**
 * Flatten a DesignTokens object into a flat Record of CSS custom property
 * names → values. These are injected as inline `style` by DesignSystemProvider.
 *
 * Naming convention: `--<group>-<key>` (e.g. `--text-primary`, `--bg-canvas`,
 * `--accent-active`, `--radius`, `--font-sans`).
 */
export function tokensToCssVars(
  t: DesignTokens,
): Record<string, string> {
  return {
    // text
    "--text-primary": t.color.text.primary,
    "--text-secondary": t.color.text.secondary,
    "--text-tertiary": t.color.text.tertiary,
    "--text-muted": t.color.text.muted,
    // bg
    "--bg-canvas": t.color.bg.canvas,
    "--bg-surface": t.color.bg.surface,
    "--bg-elevated": t.color.bg.elevated,
    "--bg-raised": t.color.bg.raised,
    "--bg-hover": t.color.bg.hover,
    // border
    "--border-default": t.color.border.default,
    "--border-strong": t.color.border.strong,
    // accent (active context)
    "--accent": t.color.accent.active,
    "--accent-dim": t.color.accent.activeDim,
    "--accent-contrast": t.color.accent.activeContrast,
    "--accent-glow": t.color.accent.activeGlow,
    // accent named
    "--accent-amber": t.color.accent.amber,
    "--accent-sky": t.color.accent.sky,
    "--accent-emerald": t.color.accent.emerald,
    "--accent-rose": t.color.accent.rose,
    "--accent-warn": t.color.accent.warn,
    "--accent-violet": t.color.accent.violet,
    "--accent-cyan": t.color.accent.cyan,
    "--accent-green": t.color.accent.green,
    // surface
    "--surface-accent-soft": t.color.surface.accentSoft,
    "--surface-accent-ring": t.color.surface.accentRing,
    // size
    "--radius": t.size.radius,
    "--radius-sm": t.size.radiusSm,
    "--radius-md": t.size.radiusMd,
    "--radius-lg": t.size.radiusLg,
    "--radius-full": t.size.radiusFull,
    "--shadow-sm": t.size.shadowSm,
    "--shadow-lg": t.size.shadowLg,
    "--shadow-card": t.size.shadowCard,
    "--shadow-modal": t.size.shadowModal,
    "--shadow-glow": t.size.shadowGlow,
    // font
    "--font-sans": t.font.sans,
    "--font-mono": t.font.mono,
  };
}

// NOTE: tokensForTheme, defaultDarkTokens, defaultLightTokens are exported from
// ./DesignSystemContext/index.ts to avoid a circular dependency (themes → tokens → themes).
