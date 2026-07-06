/**
 * z.i.b.b.y dark theme — "tichý velín" (quiet control room).
 *
 * Final audited token set (ZT): color = state, shape = category; only live
 * states (running / awaiting) may glow or pulse. Single blue accent for
 * interaction/selection — the running state has its own distinct color.
 */
import type { Theme } from "../tokens";

export const darkTheme: Theme = {
  // backgrounds — exactly 3 surface levels + deep shell layer
  colorBackgroundDeep: "#090c11",
  colorBackground: "#0b0e13",
  colorSurface: "#10151c",
  colorElevated: "#151c25",
  colorRaised: "#151c25",
  colorHover: "#151c25",

  // foreground
  colorForeground: "#e6edf3",
  colorForegroundDim: "#9aa7b4",
  // WCAG AA (>=4.5:1) against all surface levels (colorBackgroundDeep..colorElevated) —
  // see phase 19.2 commit message for computed ratios.
  colorForegroundFaint: "#7a8793",

  // borders
  colorBorder: "rgba(255,255,255,0.08)",
  colorBorderStrong: "rgba(255,255,255,0.14)",

  // accent — interaction/selection/brand only (NOT the running state)
  colorAccent: "#5b8def",
  colorAccentDim: "rgba(91,141,239,0.14)",
  colorAccentContrast: "#0b0e13",
  colorAccentGlow: "rgba(91,141,239,0.4)",

  // status — the only colors allowed to glow
  colorOk: "#3fcf8e",
  colorWarn: "#f0b429",
  colorDanger: "#ff6b6b",
  colorRun: "#7aa5f8",

  // risk categories — the only categorical palette
  colorRiskPayment: "#f0b429",
  colorRiskDeletion: "#ff6b6b",
  colorRiskPush: "#b07cff",
  colorRiskSend: "#56c4d6",

  // radii — rCtl 6px (controls/chips), rPanel 10px (panels/modals)
  radiusDefault: "6px",
  radiusSm: "6px",
  radiusMd: "6px",
  radiusLg: "10px",
  radiusFull: "9999px",

  // shadows — panels matte; elevation only on hi/modal layers
  shadowCard: "0 6px 22px rgba(0,0,0,0.35)",
  shadowModal: "0 30px 80px rgba(0,0,0,0.6)",
  shadowGlowAccent: "0 0 16px rgba(91,141,239,0.4)",

  // fonts
  fontSans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono: "var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};
