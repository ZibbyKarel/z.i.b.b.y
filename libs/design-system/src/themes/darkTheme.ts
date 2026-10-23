/**
 * Zibby 2.0 dark theme — adopted from the "Zibby-2.0 Dashboard" design
 * (claude.ai/design project `Zibby-2.0`, `Zibby-2.0-Dashboard-Standalone.html`).
 *
 * Cool graphite neutrals, soft 10px corners, a single amber brand accent and a
 * Tailwind-ish status palette (violet / sky / amber / rose / emerald). Every value
 * here is the single source of truth — `globals.css`'s `[data-theme="dark"]` block
 * (and the `@theme` defaults) mirror this table so a CSS-only (no-JS/SSR) paint
 * matches it at runtime. Keep them in lockstep.
 *
 * Design → token mapping: `--bg-0` → bg, `--bg-1` → panel, `--bg-2` → panel2
 * (cards), `--bg-3` → raised, `--bg-hover` → hover, `--border`/`--border-2` →
 * line/line2, `--text-0/1/2` → ink/ink2/ink3, `--text-3` → idle.
 *
 * The legacy fields (`colorOk`, `colorWarn`, `colorDanger`, `colorRun`,
 * `colorBackground*`, `colorForeground*`, `colorBorder*`) keep deriving from the
 * state colors via `LEGACY_TONE_MAP` (`stateTone.ts`). `colorAccent` no longer
 * aliases a state: it is the design's brand accent. Density is untouched — it
 * lives in `--sp-*` / `[data-density]`, independent of the theme.
 */
import type { Theme } from "../tokens";

export const darkTheme: Theme = {
  // ---- Neutrals ---------------------------------------------------------------
  colorBg: "#0a0b0d",
  colorPanel: "#0f1114",
  colorPanel2: "#151820",
  colorLine: "#22262f",
  colorLine2: "#2d323d",
  colorInk: "#e6e8ec",
  colorInk2: "#b4b8c2",
  colorInk3: "#7a8090",
  // The design has no background grid — kept as a token, painted transparent.
  colorGrid: "transparent",

  // ---- State vocabulary (working → thinking → blocked → error → done → idle) --
  colorStateWork: "#a78bfa",
  colorStateThink: "#38bdf8",
  colorStateBlock: "#f59e0b",
  colorStateErr: "#f43f5e",
  colorStateDone: "#10b981",
  colorStateIdle: "#555a66",

  // ---- Effects — only live status glows, only in dark -------------------------
  glowWidth: "8px",
  dotRadius: "9999px",

  // ---- Legacy backgrounds -----------------------------------------------------
  colorBackgroundDeep: "#0a0b0d", // --bg
  colorBackground: "#0a0b0d", // --bg
  colorSurface: "#0f1114", // --panel
  colorElevated: "#151820", // --panel2
  colorRaised: "#1b1f28", // design --bg-3
  colorHover: "#1e222c", // design --bg-hover

  // ---- Legacy foreground — mapped onto ink/ink2/ink3 --------------------------
  colorForeground: "#e6e8ec", // --ink
  colorForegroundDim: "#b4b8c2", // --ink2
  colorForegroundFaint: "#7a8090", // --ink3

  // ---- Legacy borders — mapped onto line/line2 --------------------------------
  colorBorder: "#22262f", // --line
  colorBorderStrong: "#2d323d", // --line2

  // ---- Brand accent -----------------------------------------------------------
  colorAccent: "#f59e0b",
  colorAccentDim: "rgba(245, 158, 11, 0.12)",
  colorAccentContrast: "#0a0b0d",
  colorAccentGlow: "rgba(245, 158, 11, 0.35)",

  // ---- Legacy status — LEGACY_TONE_MAP: ok→done, warn→blocked, bad→error, run→working
  colorOk: "#10b981",
  colorWarn: "#f59e0b",
  colorDanger: "#f43f5e",
  colorRun: "#a78bfa",

  // ---- Risk categories — the only categorical palette -------------------------
  colorRiskPayment: "#f0b429",
  colorRiskDeletion: "#ff6b6b",
  colorRiskPush: "#b07cff",
  colorRiskSend: "#56c4d6",

  // ---- Border radii — design `--radius` 10px / `--radius-sm` 6px --------------
  radiusDefault: "10px",
  radiusSm: "6px",
  radiusMd: "8px",
  radiusLg: "12px",
  radiusFull: "9999px",

  // ---- Shadows — design `--shadow-1` (cards) / `--shadow-2` (overlays) --------
  shadowCard: "0 1px 2px rgba(0, 0, 0, 0.35)",
  shadowModal: "0 8px 24px rgba(0, 0, 0, 0.45)",
  shadowGlowAccent: "0 0 8px rgba(245, 158, 11, 0.45)",

  // ---- Fonts — Inter / JetBrains Mono -----------------------------------------
  fontSans: "var(--font-sans, Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono:
    "var(--font-mono, 'JetBrains Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace)",
};
