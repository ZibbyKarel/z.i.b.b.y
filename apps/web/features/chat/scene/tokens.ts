/**
 * The constellation/node-web category palette, plus a thin adapter over the design
 * system's canonical state-tone hex resolver. A CSS custom property can't be assigned
 * to a WebGL uniform, so the orb resolves the four state colours it uses to hex — but
 * through the ONE shared resolver in `@zibby/design-system` (`resolveStateToneHex`),
 * not a second private hex table. Everything here is dependency-free and callable
 * from the render loop after the first resolve.
 */
import { type StateTone, resolveStateToneHex } from "@zibby/design-system";

/** The state colours the orb resolves from — the subset of the canonical
 * {@link StateTone} the scene expresses. Includes `warn` so awaiting-approval reads
 * as the shared warning/amber tone (`bad` stays reserved for error) — matching
 * `runStateTone`, where `awaiting-approval` → `warn` and `error` → `bad`. */
export type SceneColorToken = Extract<StateTone, "accent" | "run" | "ok" | "warn" | "bad">;

const SCENE_TOKENS: readonly SceneColorToken[] = ["accent", "run", "ok", "warn", "bad"];

let tokenCache: Record<SceneColorToken, string> | null = null;

/**
 * The scene's state-colour tokens resolved to hex via the shared DS resolver, read
 * once and cached. Safe to call every frame afterwards (a cached object lookup).
 */
export function resolveSceneTokens(): Record<SceneColorToken, string> {
  if (tokenCache) return tokenCache;
  tokenCache = SCENE_TOKENS.reduce(
    (acc, tone) => {
      acc[tone] = resolveStateToneHex(tone);
      return acc;
    },
    {} as Record<SceneColorToken, string>,
  );
  return tokenCache;
}

/**
 * One accent hue per real agent category (the 7 in
 * `apps/api/data-test/agents/_categories.json`). The constellation clusters and
 * the background node-web both read this map, so an agent's avatar and its cluster
 * of distant nodes are unmistakably the same taxonomy. Hues are chosen to sit in
 * ZIBBY's cool cosmic family while staying distinguishable — the design brief's
 * "grouped in colors that match their real categories".
 *
 * Keyed by the category `name` exactly as stored (Czech). An agent whose category
 * is missing/unknown falls back to {@link DEFAULT_CATEGORY_COLOR}.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  Vývoj: "#5b8def", // accent blue — building
  Kvalita: "#3fcf8e", // green — quality/tests
  Výzkum: "#4fd1e0", // cyan — research
  Dokumentace: "#a78bfa", // violet — docs
  Média: "#e879a8", // magenta — media
  Domácnost: "#f0b429", // amber — household
  Psaní: "#7c8cf8", // indigo — writing
  // "Delivery" isn't one of the 7 canonical categories, but the delivery-pipeline
  // agent files carry it; map it to the dev-blue family so those roles still cluster.
  Delivery: "#5b8def",
};

/** Colour for an agent with no category or an unrecognised one. */
export const DEFAULT_CATEGORY_COLOR = "#6b7a94";

/** The category colour for a given (possibly undefined) category name. */
export function categoryColor(category: string | undefined): string {
  if (!category) return DEFAULT_CATEGORY_COLOR;
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

/**
 * Hex fallback for the pipeline/chain accent — the design system's dark-theme
 * `--color-risk-push` value — mirroring {@link stateToneHex}'s own SSR/too-early
 * fallback so a too-early read still resolves the push purple.
 */
const PIPELINE_ACCENT_FALLBACK_HEX = "#b07cff";

let pipelineAccentCache: string | null = null;

/**
 * The pipeline/chain accent resolved to hex: the shared "push" risk-category tone
 * (`--color-risk-push`) already used for an `@pipeline` mention
 * (`HighlightTextAreaField`) and pipeline risk badges (`Tag` `risk="push"`) — so the
 * constellation's stronger pipeline mark reads as the *same* purple the rest of the
 * app uses for "pipeline", not a private colour. `push` isn't a {@link StateTone}
 * (it's a risk category, not a live state), so this reads `--color-risk-push`
 * directly, live from the DOM, and caches it the same way
 * {@link resolveStateToneHex} caches its tones.
 */
export function resolvePipelineAccentHex(): string {
  if (pipelineAccentCache) return pipelineAccentCache;
  const resolved =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-risk-push").trim()
      : "";
  pipelineAccentCache = resolved || PIPELINE_ACCENT_FALLBACK_HEX;
  return pipelineAccentCache;
}

/** Test seam — drop the resolved pipeline-accent cache (theme swap in a test harness). */
export function resetPipelineAccentHexCache(): void {
  pipelineAccentCache = null;
}

/**
 * Hex fallback for the neutral "ambient structure" tone — the design system's
 * dark-theme `--color-foreground-faint` value — mirroring {@link
 * PIPELINE_ACCENT_FALLBACK_HEX}'s posture for an SSR/too-early read.
 */
const FOREGROUND_FAINT_FALLBACK_HEX = "#66737f";

let foregroundFaintCache: string | null = null;

/**
 * The neutral "ambient structure" colour resolved to hex: the shared
 * `--color-foreground-faint` token, the SAME neutral tone the retired SVG web used
 * for its spokes/rim (`stroke-foreground-faint`) — so the WebGL net's faint inner
 * octagon + spokes read as the identical, unbranded "wiring" tone, not a new hex.
 */
export function resolveForegroundFaintHex(): string {
  if (foregroundFaintCache) return foregroundFaintCache;
  const resolved =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-foreground-faint").trim()
      : "";
  foregroundFaintCache = resolved || FOREGROUND_FAINT_FALLBACK_HEX;
  return foregroundFaintCache;
}

/** Test seam — drop the resolved foreground-faint cache. */
export function resetForegroundFaintHexCache(): void {
  foregroundFaintCache = null;
}
