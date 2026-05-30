/**
 * z.i.b.b.y design tokens — the single source of visual truth.
 *
 * These raw values feed the Tailwind preset (theme/preset.ts). They are NOT
 * `extend`-ed onto Tailwind defaults: the preset replaces the default scale so
 * only project tokens exist in the generated CSS.
 *
 * Visual DNA: a calm, dark "velín" (control room) for the ZIBBY agentic OS —
 * JARVIS-grade HUD with angular panels, monospace accents and two context
 * accents (home = amber, work = blue).
 */

/** Semantic colors. Context accent is injected at runtime via CSS variables. */
export const colors = {
  transparent: "transparent",
  current: "currentColor",

  /** App background ladder (darkest → lightest surface). */
  "surface-0": "#0a0c10",
  "surface-1": "#0d1117",
  "surface-2": "#11161d",

  /** Panel surfaces. */
  background: "#0d1117",
  panel: "#0f141b",
  "panel-hi": "#141b24",

  /** Hairlines. */
  border: "rgba(255,255,255,0.07)",
  "border-hi": "rgba(255,255,255,0.12)",

  /** Ink (text). */
  foreground: "#e6edf3",
  "foreground-dim": "#9aa7b4",
  "foreground-faint": "#5d6b7a",

  /** Context accents — also exposed as the dynamic `accent` triplet below. */
  home: "#f0b429",
  "home-dim": "rgba(240,180,41,0.16)",
  work: "#5b8def",
  "work-dim": "rgba(91,141,239,0.16)",

  /**
   * Active context accent, switched at runtime (see contextVars).
   * `--zb-accent` holds space-separated RGB channels so Tailwind's `/<alpha>`
   * opacity modifiers (e.g. `border-accent/30`) resolve to valid CSS.
   */
  accent: "rgb(var(--zb-accent) / <alpha-value>)",
  "accent-dim": "var(--zb-accent-dim)",
  "accent-contrast": "var(--zb-accent-contrast)",

  /** Status. */
  ok: "#39d98a",
  warn: "#f0b429",
  bad: "#ff6b6b",
  run: "#5b8def",

  /** Model + thinking badges (orchestration). */
  "model-opus": "#b07cff",
  "model-sonnet": "#56c4d6",
  "model-haiku": "#7fd98a",
  "think-high": "#f0883e",
  "think-medium": "#5b8def",
  "think-low": "#5d6b7a",
} as const

/**
 * Per-context CSS variable sets consumed by the `accent` color tokens.
 * `--zb-accent` is RGB channels (for alpha modifiers); the dim / glow vars are
 * full color values used by `bg-accent-dim` and accent glow shadows.
 */
export const contextVars = {
  home: {
    "--zb-accent": "240 180 41",
    "--zb-accent-dim": colors["home-dim"],
    "--zb-accent-contrast": colors["surface-0"],
    "--zb-accent-glow": "rgba(240,180,41,0.4)",
  },
  work: {
    "--zb-accent": "91 141 239",
    "--zb-accent-dim": colors["work-dim"],
    "--zb-accent-contrast": colors["surface-0"],
    "--zb-accent-glow": "rgba(91,141,239,0.4)",
  },
} as const

export type ContextName = keyof typeof contextVars

export const fontFamily: Record<string, string[]> = {
  sans: [
    "var(--font-sans)",
    "Geist",
    "-apple-system",
    "BlinkMacSystemFont",
    "system-ui",
    "sans-serif",
  ],
  mono: [
    "var(--font-mono)",
    "JetBrains Mono",
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "monospace",
  ],
}

/** Compact, HUD-friendly type scale (rounded from the prototype's px values). */
export const fontSize: Record<string, [string, { lineHeight: string }]> = {
  "2xs": ["0.5rem", { lineHeight: "1.25" }], // 8
  xs: ["0.5625rem", { lineHeight: "1.3" }], // 9
  sm: ["0.625rem", { lineHeight: "1.4" }], // 10
  caption: ["0.6875rem", { lineHeight: "1.4" }], // 11
  base: ["0.75rem", { lineHeight: "1.5" }], // 12
  md: ["0.8125rem", { lineHeight: "1.5" }], // 13
  lg: ["0.875rem", { lineHeight: "1.4" }], // 14
  xl: ["0.9375rem", { lineHeight: "1.35" }], // 15
  "2xl": ["1.0625rem", { lineHeight: "1.3" }], // 17
  "3xl": ["1.25rem", { lineHeight: "1.25" }], // 20
  "4xl": ["1.375rem", { lineHeight: "1.2" }], // 22
  "5xl": ["1.6875rem", { lineHeight: "1.2" }], // 27
}

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const

export const letterSpacing = {
  tighter: "-0.01em",
  normal: "0",
  wide: "0.04em",
  wider: "0.1em",
  widest: "0.18em",
  mono: "0.3em",
} as const

/** Angular HUD: small radii dominate. */
export const borderRadius = {
  none: "0",
  sm: "2px",
  DEFAULT: "3px",
  md: "4px",
  lg: "8px",
  xl: "11px",
  "2xl": "12px",
  full: "9999px",
} as const

export const boxShadow = {
  none: "none",
  hairline: "0 1px 0 rgba(255,255,255,0.02)",
  panel: "0 8px 30px rgba(0,0,0,0.3)",
  card: "0 6px 22px rgba(0,0,0,0.35)",
  dropdown: "0 18px 50px rgba(0,0,0,0.5)",
  modal: "0 30px 80px rgba(0,0,0,0.6)",
  "glow-accent": "0 0 16px var(--zb-accent-glow, rgba(91,141,239,0.4))",
} as const
