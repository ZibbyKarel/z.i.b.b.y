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
 * {@link StateTone} the scene expresses (no `warn`; approval-waiting uses `bad`). */
export type SceneColorToken = Extract<StateTone, "accent" | "run" | "ok" | "bad">;

const SCENE_TOKENS: readonly SceneColorToken[] = ["accent", "run", "ok", "bad"];

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
