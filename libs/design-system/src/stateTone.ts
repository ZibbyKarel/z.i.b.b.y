/**
 * The canonical state vocabulary — ONE source of truth for "what state is this in".
 *
 * ZIBBY has exactly five semantic states expressed as colour: `accent` (neutral /
 * live / interactive), `ok` (success), `warn` (attention / awaiting), `bad` (error /
 * danger), `run` (in-flight work). Every "is this alive and in what state" surface —
 * the HUD `Card`/`Corners`/`StatusDot`, the approvals gate, and the Chat-UI orb —
 * resolves from this one type instead of re-declaring its own parallel palette.
 *
 * This is the shared vocabulary half of the living-state contract; the animated half
 * is `LivingGlow`. See `theme/LIVING-STATE.md`.
 */
export type StateTone = "accent" | "ok" | "warn" | "bad" | "run";

/** Canonical iteration order (stories, meters, docs). */
export const STATE_TONES: readonly StateTone[] = ["accent", "ok", "warn", "bad", "run"];

/** Each tone's CSS custom property — the theme var a class/style resolves from. */
export const stateToneVar: Record<StateTone, string> = {
  accent: "var(--color-accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  run: "var(--color-run)",
};

/**
 * Hex fallbacks mirroring `theme/globals.css`, for the rare consumer that can't take
 * a CSS var — a WebGL uniform (the Chat-UI orb) or an early/SSR read. Kept in lockstep
 * with the `--color-*` tokens; {@link resolveStateToneHex} prefers the live computed
 * value and falls back to these.
 */
export const stateToneHex: Record<StateTone, string> = {
  accent: "#5b8def",
  ok: "#3fcf8e",
  warn: "#f0b429",
  bad: "#ff6b6b",
  run: "#7aa5f8",
};

let hexCache: Partial<Record<StateTone, string>> = {};

/**
 * A tone resolved to a hex string a `THREE.Color` (or any non-CSS consumer) can parse.
 * Reads the live computed `--color-<tone>` from the document once per tone and caches
 * it (the theme is static dark — nothing to react to at runtime); falls back to
 * {@link stateToneHex} under SSR/jsdom or a too-early call. Safe to call every frame.
 */
export function resolveStateToneHex(tone: StateTone): string {
  const cached = hexCache[tone];
  if (cached) return cached;
  const resolved =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(`--color-${tone}`).trim()
      : "";
  const value = resolved || stateToneHex[tone];
  hexCache[tone] = value;
  return value;
}

/** Test seam — drop the resolved-hex cache (theme swap in a test harness). */
export function resetStateToneHexCache(): void {
  hexCache = {};
}
