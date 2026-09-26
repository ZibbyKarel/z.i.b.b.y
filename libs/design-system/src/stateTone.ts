/**
 * The canonical state vocabulary — ONE source of truth for "what state is this in".
 *
 * ZibbyCorp (ZA-01) redefines the vocabulary to the six states an agent's work can be
 * in, in canonical order: `working → thinking → blocked → error → done → idle`. Every
 * "is this alive and in what state" surface — `AgentGlyph`, `StatePill`, `CellStrip`,
 * the HUD `Card`/`Corners`/`StatusDot`/`Tag`/`Stat`, the approvals gate, and the
 * Chat-UI orb — resolves from this one type instead of re-declaring its own parallel
 * palette. See DS.md §2.2 and `theme/LIVING-STATE.md`.
 *
 * The **old** five-tone vocabulary (`accent | ok | warn | bad | run`) is kept as
 * {@link LegacyStateTone}: existing components accept both old and new tone names at
 * their public boundary (see {@link AnyStateTone}, {@link normalizeStateTone}) so the
 * many app call sites that still emit the old names (`run.ts#runStateTone`, …) keep
 * compiling until Part B rewrites them — see the ZA-01 plan.
 */
export type StateTone = "working" | "thinking" | "blocked" | "error" | "done" | "idle";

/** Canonical iteration order (stories, meters, docs, legends) — DS.md §2.2. */
export const STATE_ORDER: readonly StateTone[] = [
  "working",
  "thinking",
  "blocked",
  "error",
  "done",
  "idle",
];

/** @deprecated Use {@link STATE_ORDER} — kept as an alias so existing imports resolve. */
export const STATE_TONES: readonly StateTone[] = STATE_ORDER;

/** The default English state label (`zibby.js`'s `S[state].label`) — `StatePill`'s
 *  default, overridable via its own `label` prop. */
export const STATE_LABEL: Record<StateTone, string> = {
  working: "Working",
  thinking: "Thinking",
  blocked: "Blocked",
  error: "Error",
  done: "Done",
  idle: "Idle",
};

/** The pre-ZibbyCorp five-tone vocabulary. */
export type LegacyStateTone = "accent" | "ok" | "warn" | "bad" | "run";

/**
 * The one legacy → canonical mapping (DS.md ZA-01 plan table). Every component that
 * still accepts a {@link LegacyStateTone} at its boundary resolves through this map
 * before touching a Tailwind class or CSS var — there is no second copy of it.
 */
export const LEGACY_TONE_MAP: Record<LegacyStateTone, StateTone> = {
  accent: "thinking",
  ok: "done",
  warn: "blocked",
  bad: "error",
  run: "working",
};

/** Accepted at every DS component boundary that used to be typed `StateTone` — both
 * the canonical and the legacy vocabulary resolve to the same six colours. */
export type AnyStateTone = StateTone | LegacyStateTone;

/**
 * Collapses a {@link LegacyStateTone} onto the canonical vocabulary; a canonical name
 * passes through unchanged. The one normalization point every DS component boundary
 * (`Card`, `LivingGlow`, `Stat`, `StatusDot`, `Tag`) calls before resolving a
 * Tailwind class or CSS var — see `theme/LIVING-STATE.md`.
 */
export function normalizeStateTone(tone: AnyStateTone): StateTone {
  return Object.hasOwn(LEGACY_TONE_MAP, tone)
    ? LEGACY_TONE_MAP[tone as LegacyStateTone]
    : (tone as StateTone);
}

/**
 * The loose sibling of {@link normalizeStateTone} for the DS "superset" tone unions
 * (`TagTone`, `StatTone`, `DotTone` — `StateTone`/`AnyStateTone` plus their own extras
 * like `neutral`, `wait`, a `RiskKind`). A legacy member collapses onto the canonical
 * vocabulary; anything else (an extra, or already-canonical) passes through unchanged.
 * The return type strips {@link LegacyStateTone} out of `T` (replacing it with
 * {@link StateTone}), so the result indexes a `Record` keyed by the canonical
 * vocabulary + the union's own extras without an `as` cast at the call site.
 */
export function normalizeToneLike<T extends string>(
  tone: T,
): Exclude<T, LegacyStateTone> | StateTone {
  return (
    Object.hasOwn(LEGACY_TONE_MAP, tone) ? LEGACY_TONE_MAP[tone as LegacyStateTone] : tone
  ) as Exclude<T, LegacyStateTone> | StateTone;
}

/** Each tone's CSS custom property — the theme var a `style`/canvas consumer resolves
 * from (`LivingGlow`'s `--living-color`, `AgentGlyph`, `StatePill`, `CellStrip`). */
export const stateToneVar: Record<StateTone, string> = {
  working: "var(--color-state-work)",
  thinking: "var(--color-state-think)",
  blocked: "var(--color-state-block)",
  error: "var(--color-state-err)",
  done: "var(--color-state-done)",
  idle: "var(--color-state-idle)",
};

/**
 * Hex fallbacks mirroring the dark-theme oklch values in `theme/globals.css`, for the
 * rare consumer that can't take a CSS var — a WebGL uniform (the Chat-UI orb) or an
 * early/SSR read. Kept in lockstep with the `--color-state-*` tokens;
 * {@link resolveStateToneHex} prefers the live computed value and falls back to these.
 */
export const stateToneHex: Record<StateTone, string> = {
  working: "#4ce0a0",
  thinking: "#8fb4f5",
  blocked: "#f0c14b",
  error: "#ff6b57",
  done: "#c58ef0",
  idle: "#4a504b",
};

let hexCache: Partial<Record<StateTone, string>> = {};

/**
 * A tone resolved to a hex string a `THREE.Color` (or any non-CSS consumer) can parse.
 * Accepts both the canonical and the {@link LegacyStateTone} vocabulary. Reads the live
 * computed `--color-state-<tone>` from the document once per (canonical) tone and
 * caches it; falls back to {@link stateToneHex} under SSR/jsdom or a too-early call.
 * Safe to call every frame.
 */
export function resolveStateToneHex(tone: AnyStateTone): string {
  const resolvedTone = normalizeStateTone(tone);
  const cached = hexCache[resolvedTone];
  if (cached) return cached;
  const cssVarName = stateToneVar[resolvedTone].slice("var(".length, -1);
  const resolved =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim()
      : "";
  const value = resolved || stateToneHex[resolvedTone];
  hexCache[resolvedTone] = value;
  return value;
}

/** Test seam — drop the resolved-hex cache (theme swap in a test harness). */
export function resetStateToneHexCache(): void {
  hexCache = {};
}
