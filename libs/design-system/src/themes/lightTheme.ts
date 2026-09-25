/**
 * ZibbyCorp light theme — "instrument paper" (DS.md §2.4).
 *
 * See `darkTheme.ts` for the full rationale (this is the light half of the same
 * table). No shadow, no blur, no glow in light — `--gw` is `0px`.
 */
import type { Theme } from "../tokens";

export const lightTheme: Theme = {
  // ---- ZibbyCorp neutrals (DS.md §2.1, light) -----------------------------
  colorBg: "#f3f4f2",
  colorPanel: "#fafaf8",
  colorPanel2: "#edeeeb",
  colorLine: "#d9dbd6",
  colorLine2: "#bfc2bc",
  colorInk: "#111312",
  colorInk2: "#50544f",
  colorInk3: "#8a8e88",
  colorGrid: "rgba(17, 19, 18, 0.05)",

  // ---- ZibbyCorp state vocabulary (DS.md §2.2, light) ---------------------
  colorStateWork: "oklch(0.6 0.14 160)",
  colorStateThink: "oklch(0.58 0.14 250)",
  colorStateBlock: "oklch(0.7 0.15 70)",
  colorStateErr: "oklch(0.58 0.2 25)",
  colorStateDone: "oklch(0.56 0.15 300)",
  colorStateIdle: "#a9ada7",

  // ---- Effects (DS.md §2.3, light) — nothing glows in light ---------------
  glowWidth: "0px",
  dotRadius: "0",

  // ---- Legacy backgrounds — flattened onto bg / panel / panel2 ------------
  colorBackgroundDeep: "#f3f4f2", // --bg
  colorBackground: "#f3f4f2", // --bg
  colorSurface: "#fafaf8", // --panel
  colorElevated: "#edeeeb", // --panel2
  colorRaised: "#edeeeb", // --panel2
  colorHover: "#edeeeb", // --panel2

  // ---- Legacy foreground — mapped onto ink/ink2/ink3 ----------------------
  colorForeground: "#111312", // --ink
  colorForegroundDim: "#50544f", // --ink2
  colorForegroundFaint: "#8a8e88", // --ink3

  // ---- Legacy borders — mapped onto line/line2 ----------------------------
  colorBorder: "#d9dbd6", // --line
  colorBorderStrong: "#bfc2bc", // --line2

  // ---- Legacy accent — LEGACY_TONE_MAP: accent → thinking -----------------
  colorAccent: "oklch(0.58 0.14 250)",
  colorAccentDim: "rgba(80, 84, 79, 0.1)",
  colorAccentContrast: "#fafaf8", // ink-on-accent ≈ inverse pairing (panel on ink)
  colorAccentGlow: "oklch(0.58 0.14 250 / 35%)",

  // ---- Legacy status — LEGACY_TONE_MAP: ok→done, warn→blocked, bad→error, run→working
  colorOk: "oklch(0.56 0.15 300)",
  colorWarn: "oklch(0.7 0.15 70)",
  colorDanger: "oklch(0.58 0.2 25)",
  colorRun: "oklch(0.6 0.14 160)",

  // ---- Risk categories — the only categorical palette (unchanged by ZA-01) --
  colorRiskPayment: "#c9890a",
  colorRiskDeletion: "#e03030",
  colorRiskPush: "#7c3fb0",
  colorRiskSend: "#1d8fa5",

  // ---- Border radii — DS.md §6: 0 everywhere ------------------------------
  radiusDefault: "0px",
  radiusSm: "0px",
  radiusMd: "0px",
  radiusLg: "0px",
  radiusFull: "9999px",

  // ---- Shadows — none in light; glow is `--gw` (0px) so it's a no-op here --
  shadowCard: "none",
  shadowModal: "none",
  shadowGlowAccent: "none",

  // ---- Liquid glass — flattened to a solid panel, no blur, no shadow ------
  gradientGlass: "var(--color-panel)",
  colorGlassBorder: "var(--color-line-2)",
  shadowGlass: "none",
  blurGlass: "none",

  // ---- Fonts — Geist / Geist Mono (DS.md §3) ------------------------------
  fontSans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono: "var(--font-mono, 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};
