/**
 * ZibbyCorp dark theme — "instrument paper" (DS.md §2.4).
 *
 * Monochrome and technical: squared corners, 1px hairlines, mono labels. The only
 * color is status. Every neutral/state value here is the single source of truth —
 * `globals.css`'s `[data-theme="dark"]` block mirrors this table (kept in lockstep;
 * see the comment there) so a CSS-only (no-JS/SSR) paint matches this at runtime.
 *
 * The pre-ZibbyCorp fields (`colorAccent`, `colorOk`, `colorWarn`, `colorDanger`,
 * `colorRun`, `colorBackground*`, `colorForeground*`, `colorBorder*`) are **not**
 * removed — dozens of existing components/app call sites still read them via
 * Tailwind classes (`bg-surface`, `text-accent`, `border-run`, …). Their *values*
 * now derive from the new DS.md neutrals/state colors via `LEGACY_TONE_MAP`
 * (`stateTone.ts`) so every old surface automatically repaints in the new palette
 * without a single Tailwind class changing — see ZA-01 plan.
 */
import type { Theme } from "../tokens";

export const darkTheme: Theme = {
  // ---- ZibbyCorp neutrals (DS.md §2.1, dark) ------------------------------
  colorBg: "#0a0b0b",
  colorPanel: "#101211",
  colorPanel2: "#161917",
  colorLine: "#232725",
  colorLine2: "#343936",
  colorInk: "#ecefea",
  colorInk2: "#a2a8a2",
  colorInk3: "#666c67",
  colorGrid: "rgba(236, 239, 234, 0.035)",

  // ---- ZibbyCorp state vocabulary (DS.md §2.2, dark) ----------------------
  colorStateWork: "oklch(0.82 0.17 160)",
  colorStateThink: "oklch(0.78 0.13 245)",
  colorStateBlock: "oklch(0.84 0.15 80)",
  colorStateErr: "oklch(0.7 0.2 25)",
  colorStateDone: "oklch(0.78 0.14 300)",
  colorStateIdle: "#4a504b",

  // ---- Effects (DS.md §2.3, dark) — only live status glows, only here -----
  glowWidth: "8px",
  dotRadius: "0",

  // ---- Legacy backgrounds — the app's 6-level naming, now flattened onto the
  // 3 ZibbyCorp neutrals (bg / panel / panel2) ------------------------------
  colorBackgroundDeep: "#0a0b0b", // --bg
  colorBackground: "#0a0b0b", // --bg
  colorSurface: "#101211", // --panel
  colorElevated: "#161917", // --panel2
  colorRaised: "#161917", // --panel2
  colorHover: "#161917", // --panel2

  // ---- Legacy foreground — mapped onto ink/ink2/ink3 ----------------------
  colorForeground: "#ecefea", // --ink
  colorForegroundDim: "#a2a8a2", // --ink2
  colorForegroundFaint: "#666c67", // --ink3

  // ---- Legacy borders — mapped onto line/line2 ----------------------------
  colorBorder: "#232725", // --line
  colorBorderStrong: "#343936", // --line2

  // ---- Legacy accent — LEGACY_TONE_MAP: accent → thinking -----------------
  colorAccent: "oklch(0.78 0.13 245)",
  colorAccentDim: "rgba(143, 180, 245, 0.14)",
  colorAccentContrast: "#101211", // ink-on-accent ≈ inverse pairing (panel on ink)
  colorAccentGlow: "oklch(0.78 0.13 245 / 40%)",

  // ---- Legacy status — LEGACY_TONE_MAP: ok→done, warn→blocked, bad→error, run→working
  colorOk: "oklch(0.78 0.14 300)",
  colorWarn: "oklch(0.84 0.15 80)",
  colorDanger: "oklch(0.7 0.2 25)",
  colorRun: "oklch(0.82 0.17 160)",

  // ---- Risk categories — the only categorical palette (unchanged by ZA-01) --
  colorRiskPayment: "#f0b429",
  colorRiskDeletion: "#ff6b6b",
  colorRiskPush: "#b07cff",
  colorRiskSend: "#56c4d6",

  // ---- Border radii — DS.md §6: 0 everywhere; radiusFull survives only for
  // the sanctioned round exceptions (status pod, flow packet). ---------------
  radiusDefault: "0px",
  radiusSm: "0px",
  radiusMd: "0px",
  radiusLg: "0px",
  radiusFull: "9999px",

  // ---- Shadows — DS.md §1.2/§6: no drop shadows. The one exception is the
  // live-status glow, which reuses `--gw` (0 in light, 8px in dark) so it
  // auto-disables in light without a second flag. ---------------------------
  shadowCard: "none",
  shadowModal: "none",
  shadowGlowAccent: "0 0 8px oklch(0.78 0.13 245 / 45%)",

  // ---- Fonts — Geist / Geist Mono (DS.md §3) ------------------------------
  fontSans: "var(--font-sans, Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif)",
  fontMono: "var(--font-mono, 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
};
