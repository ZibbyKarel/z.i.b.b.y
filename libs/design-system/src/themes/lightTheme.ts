/**
 * z.i.b.b.y light theme — structural stub.
 * TODO: design light palette (future sprint).
 */
import type { Theme } from "../tokens";

export const lightTheme: Theme = {
  // backgrounds
  colorBackground:       "#f5f7fa",
  colorSurface:          "#ffffff",
  colorElevated:         "#f0f3f7",
  colorRaised:           "#e8ecf2",
  colorHover:            "#e2e7ef",

  // foreground
  colorForeground:       "#0d1117",
  colorForegroundDim:    "#3d4b5a",
  colorForegroundFaint:  "#6b7c8d",

  // borders
  colorBorder:           "rgba(0,0,0,0.09)",
  colorBorderStrong:     "rgba(0,0,0,0.15)",

  // accent (default: home/amber)
  colorAccent:           "#c9890a",
  colorAccentDim:        "rgba(201,137,10,0.14)",
  colorAccentContrast:   "#ffffff",
  colorAccentGlow:       "rgba(201,137,10,0.35)",

  // named accents
  colorHome:             "#c9890a",
  colorWork:             "#3b6fd4",

  // status
  colorOk:               "#1a9b5f",
  colorWarn:             "#c9890a",
  colorDanger:           "#e03030",

  // model badges
  colorModelOpus:        "#7c3fb0",
  colorModelSonnet:      "#1d8fa5",
  colorModelHaiku:       "#2a8a3a",

  // think levels
  colorThinkHigh:        "#d4660a",
  colorThinkMedium:      "#3b6fd4",
  colorThinkLow:         "#6b7c8d",

  // radii
  radiusDefault:         "3px",
  radiusSm:              "2px",
  radiusMd:              "4px",
  radiusLg:              "8px",
  radiusFull:            "9999px",

  // shadows
  shadowCard:            "0 2px 10px rgba(0,0,0,0.08)",
  shadowModal:           "0 16px 50px rgba(0,0,0,0.2)",
  shadowGlowAccent:      "0 0 12px rgba(201,137,10,0.3)",

  // fonts
  fontSans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};
