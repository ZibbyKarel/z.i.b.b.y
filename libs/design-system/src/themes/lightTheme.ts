/**
 * Zibby 2.0 light theme — the light half of the "Zibby-2.0 Dashboard" design.
 *
 * See `darkTheme.ts` for the rationale and the design → token mapping. The design
 * reuses its dark-mode status hues on white; here they step down one shade
 * (Tailwind 600) so status text keeps WCAG AA contrast on the light panels.
 * No glow in light — `--gw` is `0px`.
 */
import type { Theme } from "../tokens";

export const lightTheme: Theme = {
  // ---- Neutrals ---------------------------------------------------------------
  colorBg: "#f6f6f4",
  colorPanel: "#ffffff",
  colorPanel2: "#fafaf8",
  colorLine: "#e6e6e2",
  colorLine2: "#d4d4d0",
  colorInk: "#0e0f12",
  colorInk2: "#3a3e48",
  colorInk3: "#6b7280",
  // The design has no background grid — kept as a token, painted transparent.
  colorGrid: "transparent",

  // ---- State vocabulary -------------------------------------------------------
  colorStateWork: "#7c3aed",
  colorStateThink: "#0284c7",
  colorStateBlock: "#d97706",
  colorStateErr: "#e11d48",
  colorStateDone: "#059669",
  colorStateIdle: "#9aa0ac",

  // ---- Effects — nothing glows in light ---------------------------------------
  glowWidth: "0px",
  dotRadius: "9999px",

  // ---- Legacy backgrounds -----------------------------------------------------
  colorBackgroundDeep: "#f6f6f4", // --bg
  colorBackground: "#f6f6f4", // --bg
  colorSurface: "#ffffff", // --panel
  colorElevated: "#fafaf8", // --panel2
  colorRaised: "#f0f0ec", // design --bg-3
  colorHover: "#ececea", // design --bg-hover

  // ---- Legacy foreground — mapped onto ink/ink2/ink3 --------------------------
  colorForeground: "#0e0f12", // --ink
  colorForegroundDim: "#3a3e48", // --ink2
  colorForegroundFaint: "#6b7280", // --ink3

  // ---- Legacy borders — mapped onto line/line2 --------------------------------
  colorBorder: "#e6e6e2", // --line
  colorBorderStrong: "#d4d4d0", // --line2

  // ---- Brand accent -----------------------------------------------------------
  colorAccent: "#d97706",
  colorAccentDim: "rgba(217, 119, 6, 0.12)",
  colorAccentContrast: "#ffffff",
  colorAccentGlow: "rgba(217, 119, 6, 0.35)",

  // ---- Legacy status — LEGACY_TONE_MAP: ok→done, warn→blocked, bad→error, run→working
  colorOk: "#059669",
  colorWarn: "#d97706",
  colorDanger: "#e11d48",
  colorRun: "#7c3aed",

  // ---- Risk categories — the only categorical palette -------------------------
  colorRiskPayment: "#c9890a",
  colorRiskDeletion: "#e03030",
  colorRiskPush: "#7c3fb0",
  colorRiskSend: "#1d8fa5",

  // ---- Border radii -----------------------------------------------------------
  radiusDefault: "10px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "12px",
  radiusFull: "9999px",

  // ---- Shadows ----------------------------------------------------------------
  shadowCard: "0 1px 2px rgba(0, 0, 0, 0.06)",
  shadowModal: "0 12px 28px rgba(0, 0, 0, 0.1)",
  shadowGlowAccent: "none",

  // ---- Fonts — Inter / JetBrains Mono -----------------------------------------
  fontSans: "var(--font-sans, Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono:
    "var(--font-mono, 'JetBrains Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace)",
};
