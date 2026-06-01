/**
 * z.i.b.b.y dark theme — "JARVIS control room" HUD.
 *
 * Default context = home (amber accent). Use contextTokens(context) to get
 * a PartialDesignTokens override that switches the active accent.
 */
import type { DesignTokens, FontTokens, ColorTokens, SizeTokens } from "../tokens";

const color: ColorTokens = {
  text: {
    primary: "#e6edf3",
    secondary: "#9aa7b4",
    tertiary: "#5d6b7a",
    muted: "#5d6b7a",
  },
  bg: {
    canvas: "#0a0c10",
    surface: "#0d1117",
    elevated: "#0f141b",
    raised: "#141b24",
    hover: "#141b24",
  },
  border: {
    default: "rgba(255,255,255,0.07)",
    strong: "rgba(255,255,255,0.12)",
  },
  accent: {
    // Default: home context (amber). Overridden via contextTokens().
    active: "#f0b429",
    activeDim: "rgba(240,180,41,0.16)",
    activeContrast: "#0a0c10",
    activeGlow: "rgba(240,180,41,0.4)",
    // Named accents (both contexts)
    amber: "#f0b429",
    sky: "#5b8def",
    emerald: "#39d98a",
    rose: "#ff6b6b",
    warn: "#f0b429",
    violet: "#b07cff",
    cyan: "#56c4d6",
    green: "#7fd98a",
  },
  surface: {
    accentSoft: "rgba(240,180,41,0.16)",
    accentRing: "rgba(240,180,41,0.30)",
  },
};

const size: SizeTokens = {
  radius: "3px",
  radiusSm: "2px",
  radiusMd: "4px",
  radiusLg: "8px",
  radiusFull: "9999px",
  shadowSm: "0 8px 30px rgba(0,0,0,0.3)",
  shadowLg: "0 30px 80px rgba(0,0,0,0.6)",
  shadowCard: "0 6px 22px rgba(0,0,0,0.35)",
  shadowModal: "0 30px 80px rgba(0,0,0,0.6)",
  shadowGlow: "0 0 16px var(--accent-glow, rgba(240,180,41,0.4))",
};

const font: FontTokens = {
  sans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  mono: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};

export const darkTheme: DesignTokens = { color, size, font };
