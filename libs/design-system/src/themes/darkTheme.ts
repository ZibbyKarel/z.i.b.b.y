/**
 * z.i.b.b.y dark theme — "JARVIS control room" HUD.
 *
 * Default context = home (amber accent). Use contextTokens(context) to get
 * a PartialTheme override that switches the active accent.
 */
import type { Theme } from "../tokens";

export const darkTheme: Theme = {
  // backgrounds
  colorBackground:       "#0a0c10",
  colorSurface:          "#0d1117",
  colorElevated:         "#0f141b",
  colorRaised:           "#141b24",
  colorHover:            "#141b24",

  // foreground
  colorForeground:       "#e6edf3",
  colorForegroundDim:    "#9aa7b4",
  colorForegroundFaint:  "#5d6b7a",

  // borders
  colorBorder:           "rgba(255,255,255,0.07)",
  colorBorderStrong:     "rgba(255,255,255,0.12)",

  // accent (default: home/amber — overridden via contextTokens)
  colorAccent:           "#f0b429",
  colorAccentDim:        "rgba(240,180,41,0.16)",
  colorAccentContrast:   "#0a0c10",
  colorAccentGlow:       "rgba(240,180,41,0.4)",

  // named accents
  colorHome:             "#f0b429",
  colorWork:             "#5b8def",

  // status
  colorOk:               "#39d98a",
  colorWarn:             "#f0b429",
  colorDanger:           "#ff6b6b",

  // model badges
  colorModelOpus:        "#b07cff",
  colorModelSonnet:      "#56c4d6",
  colorModelHaiku:       "#7fd98a",

  // think levels
  colorThinkHigh:        "#f0883e",
  colorThinkMedium:      "#5b8def",
  colorThinkLow:         "#5d6b7a",

  // radii
  radiusDefault:         "3px",
  radiusSm:              "2px",
  radiusMd:              "4px",
  radiusLg:              "8px",
  radiusFull:            "9999px",

  // shadows
  shadowCard:            "0 6px 22px rgba(0,0,0,0.35)",
  shadowModal:           "0 30px 80px rgba(0,0,0,0.6)",
  shadowGlowAccent:      "0 0 16px rgba(240,180,41,0.4)",

  // fonts
  fontSans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};
