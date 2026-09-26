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

/**
 * Named spacing scale. Maps to px: 0/2/4/6/8/10/12/16/20/24/28/32/36/40, plus three
 * ZibbyCorp (DS.md §4) additions that don't already have a slot on the legacy scale:
 * `175` (14px, DS.md `space-7`), `225` (18px, `space-9`) and `700` (56px, `space-14`,
 * the "document section gap" — the legacy scale tops out at 40px).
 */
export type Spacing =
  | "0"
  | "25"
  | "50"
  | "75"
  | "100"
  | "125"
  | "150"
  | "175"
  | "200"
  | "225"
  | "250"
  | "300"
  | "350"
  | "400"
  | "450"
  | "500"
  | "700";

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
  "175": "14px",
  "200": "16px",
  "225": "18px",
  "250": "20px",
  "300": "24px",
  "350": "28px",
  "400": "32px",
  "450": "36px",
  "500": "40px",
  "700": "56px",
};

/**
 * ZibbyCorp layout constants (DS.md §5) — the app shell grid. Not part of `Theme`
 * (they don't swap with theme/context), just a fixed layout vocabulary `AppFrame`/
 * `AppHeader`/`Rail` (ZA-06) and any layout math read directly.
 */
export const LAYOUT = {
  headerHeight: 56,
  railWidthLeft: 280,
  railWidthRight: 400,
  docMaxWidth: 1320,
  gridSize: 24,
  gridSizeSm: 8,
} as const;

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

  // ---- ZibbyCorp neutrals (DS.md §2.1) — the instrument-paper/blueprint palette.
  // `colorBackground*`/`colorSurface`/… above stay the app's existing 6-level
  // vocabulary (their *values* now derive from these 3 flat levels); these are the
  // literal DS.md names for the new components (`AgentGlyph`, `StatePill`,
  // `CellStrip`) and any future ZA-02 restyle to read directly. ---------------------
  /** App background, inset surfaces — DS.md `--bg`. */
  colorBg: string;
  /** Rails, cards, header — DS.md `--panel`. */
  colorPanel: string;
  /** Selected row, avatar tile, hover — DS.md `--panel2`. */
  colorPanel2: string;
  /** Default hairline, dividers — DS.md `--line`. */
  colorLine: string;
  /** Control borders, emphasized hairline — DS.md `--line2`. */
  colorLine2: string;
  /** Primary text, selected border, primary button fill — DS.md `--ink`. */
  colorInk: string;
  /** Secondary text, metadata — DS.md `--ink2`. */
  colorInk2: string;
  /** Tertiary text, mono labels, placeholders — DS.md `--ink3`. */
  colorInk3: string;
  /** Background grid line colour — DS.md `--grid`. */
  colorGrid: string;

  // ---- ZibbyCorp state vocabulary (DS.md §2.2) — canonical order:
  // working → thinking → blocked → error → done → idle. The only hues in the
  // system; see `stateTone.ts` (`StateTone`, `stateToneVar`) for the TS-side
  // vocabulary these back. ----------------------------------------------------
  colorStateWork: string;
  colorStateThink: string;
  colorStateBlock: string;
  colorStateErr: string;
  colorStateDone: string;
  colorStateIdle: string;

  // ---- Effects (DS.md §2.3) — the only two theme-swapped effect tokens ------
  /** Glow radius for live status: `0px` light, `8px` dark — DS.md `--gw`. Only
   *  live status elements glow, and only in the dark theme. */
  glowWidth: string;
  /** Status dot radius — always `0` (square pixel) — DS.md `--dot-r`. */
  dotRadius: string;

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
    // ZibbyCorp neutrals (DS.md §2.1)
    "--color-bg": t.colorBg,
    "--color-panel": t.colorPanel,
    "--color-panel-2": t.colorPanel2,
    "--color-line": t.colorLine,
    "--color-line-2": t.colorLine2,
    "--color-ink": t.colorInk,
    "--color-ink-2": t.colorInk2,
    "--color-ink-3": t.colorInk3,
    "--color-grid": t.colorGrid,
    // ZibbyCorp state vocabulary (DS.md §2.2) — working → thinking → blocked → error → done → idle
    "--color-state-work": t.colorStateWork,
    "--color-state-think": t.colorStateThink,
    "--color-state-block": t.colorStateBlock,
    "--color-state-err": t.colorStateErr,
    "--color-state-done": t.colorStateDone,
    "--color-state-idle": t.colorStateIdle,
    // effects (DS.md §2.3)
    "--gw": t.glowWidth,
    "--dot-r": t.dotRadius,
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
    // fonts
    "--font-sans": t.fontSans,
    "--font-mono": t.fontMono,
  };
}
