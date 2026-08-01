/**
 * z.i.b.b.y design token system.
 *
 * `Theme` is the single source of visual truth. `DesignSystemProvider` injects
 * all theme values as CSS custom properties; globals.css `@theme` maps Tailwind
 * utility classes onto those same vars. Components use only Tailwind classes —
 * `useTokens()` is available for the rare JS/SVG cases that need raw values.
 */

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/** Named spacing scale. Maps to px: 0/2/4/6/8/10/12/16/20/24/28/32/36/40 */
export type Spacing =
  | "0"
  | "25"
  | "50"
  | "75"
  | "100"
  | "125"
  | "150"
  | "200"
  | "250"
  | "300"
  | "350"
  | "400"
  | "450"
  | "500";

export type Padding = Spacing | [Spacing, Spacing] | [Spacing, Spacing, Spacing, Spacing];

export type Size = "xs" | "sm" | "md" | "lg" | "xl";

export const spacingValues: Record<Spacing, string> = {
  "0": "0px",
  "25": "2px",
  "50": "4px",
  "75": "6px",
  "100": "8px",
  "125": "10px",
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

export function resolvePadding(p: Padding): [Spacing, Spacing, Spacing, Spacing] {
  if (typeof p === "string") return [p, p, p, p];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  return p;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Flat theme object — all visual tokens in one place.
 *
 * Property names describe what the token IS (colorBorderStrong, radiusSm…).
 * `tokensToCssVars()` maps these to CSS custom property names consumed by
 * Tailwind utilities (bg-background, border-border-strong, rounded-sm…).
 */
export interface Theme {
  // ---- Backgrounds -------------------------------------------------------
  /** Deepest layer — sidebar / rail / input wells (design `bg0`). */
  colorBackgroundDeep: string;
  /** Page canvas / scene background. */
  colorBackground: string;
  /** Default panel/card surface. */
  colorSurface: string;
  /** Elevated panel (one step above surface). */
  colorElevated: string;
  /** Raised panel (highest panel layer). */
  colorRaised: string;
  /** Interactive element hover background. */
  colorHover: string;

  // ---- Foreground / text -------------------------------------------------
  /** Primary text. */
  colorForeground: string;
  /** Secondary / dimmed text. */
  colorForegroundDim: string;
  /** Muted / disabled text. */
  colorForegroundFaint: string;

  // ---- Borders -----------------------------------------------------------
  /** Default hairline border. */
  colorBorder: string;
  /** Strong / prominent border. */
  colorBorderStrong: string;

  // ---- Context accent (home=amber, work=sky — switched at runtime) -------
  /** Active context accent color. */
  colorAccent: string;
  /** Low-opacity accent surface (badge bg, icon bg…). */
  colorAccentDim: string;
  /** Text color on solid accent backgrounds. */
  colorAccentContrast: string;
  /** Glow color used in accent box-shadows. */
  colorAccentGlow: string;

  // ---- Semantic status ---------------------------------------------------
  colorOk: string;
  colorWarn: string;
  colorDanger: string;
  /** Running-state color — deliberately distinct from the interaction accent. */
  colorRun: string;

  // ---- Risk categories (the only categorical palette) ---------------------
  colorRiskPayment: string;
  colorRiskDeletion: string;
  colorRiskPush: string;
  colorRiskSend: string;

  // ---- Border radii ------------------------------------------------------
  radiusDefault: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusFull: string;

  // ---- Shadows -----------------------------------------------------------
  shadowCard: string;
  shadowModal: string;
  /** Accent glow box-shadow (color changes with context). */
  shadowGlowAccent: string;

  /** Liquid-glass chrome recipe (Velín-D VD_GLASS), consumed by GlassSurface. */
  gradientGlass: string;
  colorGlassBorder: string;
  shadowGlass: string;
  blurGlass: string;

  // ---- Fonts -------------------------------------------------------------
  fontSans: string;
  fontMono: string;
}

export type PartialTheme = Partial<Theme>;

/** Deep-merge a partial theme override onto a base theme. */
export function mergeTheme(base: Theme, override: PartialTheme): Theme {
  return { ...base, ...override };
}

/**
 * Flatten a Theme into a Record of CSS custom property names → values.
 * These are injected as inline `style` by DesignSystemProvider.
 *
 * CSS var naming: `--color-*` for Tailwind color tokens, `--radius-*` for
 * radius tokens, `--shadow-*` for shadow tokens, `--font-*` for font tokens.
 * Tailwind generates matching utilities (bg-background, border-border, …).
 */
export function tokensToCssVars(t: Theme): Record<string, string> {
  return {
    // backgrounds
    "--color-background-deep": t.colorBackgroundDeep,
    "--color-background": t.colorBackground,
    "--color-surface": t.colorSurface,
    "--color-elevated": t.colorElevated,
    "--color-raised": t.colorRaised,
    "--color-hover": t.colorHover,
    // foreground
    "--color-foreground": t.colorForeground,
    "--color-foreground-dim": t.colorForegroundDim,
    "--color-foreground-faint": t.colorForegroundFaint,
    // borders
    "--color-border": t.colorBorder,
    "--color-border-strong": t.colorBorderStrong,
    // accent
    "--color-accent": t.colorAccent,
    "--color-accent-dim": t.colorAccentDim,
    "--color-accent-contrast": t.colorAccentContrast,
    "--color-accent-glow": t.colorAccentGlow,
    // status
    "--color-ok": t.colorOk,
    "--color-warn": t.colorWarn,
    "--color-bad": t.colorDanger,
    "--color-run": t.colorRun,
    // risk categories
    "--color-risk-payment": t.colorRiskPayment,
    "--color-risk-deletion": t.colorRiskDeletion,
    "--color-risk-push": t.colorRiskPush,
    "--color-risk-send": t.colorRiskSend,
    // radius
    "--radius": t.radiusDefault,
    "--radius-sm": t.radiusSm,
    "--radius-md": t.radiusMd,
    "--radius-lg": t.radiusLg,
    "--radius-full": t.radiusFull,
    // shadows
    "--shadow-card": t.shadowCard,
    "--shadow-modal": t.shadowModal,
    "--shadow-glow-accent": t.shadowGlowAccent,
    // liquid glass (GlassSurface)
    "--gradient-glass": t.gradientGlass,
    "--color-glass-border": t.colorGlassBorder,
    "--shadow-glass": t.shadowGlass,
    "--blur-glass": t.blurGlass,
    // fonts
    "--font-sans": t.fontSans,
    "--font-mono": t.fontMono,
  };
}
