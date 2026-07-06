/**
 * Resolving ZIBBY's semantic design tokens to hex values a `THREE.Color` can
 * parse, plus the constellation/node-web category palette. A CSS custom property
 * can't be assigned to a WebGL uniform, so the scene reads the computed values
 * once at first use and caches them (the theme is static dark — nothing to react
 * to at runtime). Everything here is dependency-free and callable from the render
 * loop after the first resolve.
 */

/** The state colours the orb resolves from — ZIBBY's existing semantic tokens. */
export type SceneColorToken = "accent" | "run" | "ok" | "bad";

const CSS_VAR_BY_TOKEN: Record<SceneColorToken, string> = {
  accent: "--color-accent",
  run: "--color-run",
  ok: "--color-ok",
  bad: "--color-bad",
};

/** Hex fallbacks mirroring `libs/design-system/src/theme/globals.css`, used when
 * `getComputedStyle` can't resolve the property (SSR, jsdom, or too-early call). */
const FALLBACK_HEX_BY_TOKEN: Record<SceneColorToken, string> = {
  accent: "#5b8def",
  run: "#7aa5f8",
  ok: "#3fcf8e",
  bad: "#ff6b6b",
};

let tokenCache: Record<SceneColorToken, string> | null = null;

/**
 * The four state-colour tokens resolved to hex, read from the DOM once and cached.
 * Safe to call every frame afterwards (a cached object lookup).
 */
export function resolveSceneTokens(): Record<SceneColorToken, string> {
  if (tokenCache) return tokenCache;
  const styles =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  tokenCache = {
    accent: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.accent).trim() || FALLBACK_HEX_BY_TOKEN.accent,
    run: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.run).trim() || FALLBACK_HEX_BY_TOKEN.run,
    ok: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.ok).trim() || FALLBACK_HEX_BY_TOKEN.ok,
    bad: styles?.getPropertyValue(CSS_VAR_BY_TOKEN.bad).trim() || FALLBACK_HEX_BY_TOKEN.bad,
  };
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
