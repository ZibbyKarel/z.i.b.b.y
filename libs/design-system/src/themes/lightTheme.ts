/**
 * z.i.b.b.y light theme — structural stub.
 *
 * TODO: design light palette (future sprint). Currently mirrors dark with
 * inverted surface/text colors as a rough approximation.
 */
import type { DesignTokens, FontTokens, ColorTokens, SizeTokens } from "../tokens";

const color: ColorTokens = {
  text: {
    primary: "#0d1117",
    secondary: "#3d4b5a",
    tertiary: "#6b7c8d",
    muted: "#8a9aaa",
  },
  bg: {
    canvas: "#f5f7fa",
    surface: "#ffffff",
    elevated: "#f0f3f7",
    raised: "#e8ecf2",
    hover: "#e2e7ef",
  },
  border: {
    default: "rgba(0,0,0,0.09)",
    strong: "rgba(0,0,0,0.15)",
  },
  accent: {
    active: "#c9890a",
    activeDim: "rgba(201,137,10,0.14)",
    activeContrast: "#ffffff",
    activeGlow: "rgba(201,137,10,0.35)",
    amber: "#c9890a",
    sky: "#3b6fd4",
    emerald: "#1a9b5f",
    rose: "#e03030",
    warn: "#c9890a",
    violet: "#7c3fb0",
    cyan: "#1d8fa5",
    green: "#2a8a3a",
  },
  surface: {
    accentSoft: "rgba(201,137,10,0.10)",
    accentRing: "rgba(201,137,10,0.25)",
  },
};

const size: SizeTokens = {
  radius: "3px",
  radiusSm: "2px",
  radiusMd: "4px",
  radiusLg: "8px",
  radiusFull: "9999px",
  shadowSm: "0 2px 8px rgba(0,0,0,0.08)",
  shadowLg: "0 12px 40px rgba(0,0,0,0.15)",
  shadowCard: "0 2px 10px rgba(0,0,0,0.08)",
  shadowModal: "0 16px 50px rgba(0,0,0,0.2)",
  shadowGlow: "0 0 12px var(--accent-glow, rgba(201,137,10,0.3))",
};

const font: FontTokens = {
  sans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  mono: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};

export const lightTheme: DesignTokens = { color, size, font };
