/**
 * Theme registry — resolves a theme name to a DesignTokens object.
 * Lives here (not in tokens.ts) to avoid a circular dep: themes import
 * types from tokens.ts; this file imports concrete objects from themes.
 */
import type { DesignTokens } from "../tokens";
import { darkTheme } from "../themes/darkTheme";
import { lightTheme } from "../themes/lightTheme";

export { darkTheme as defaultDarkTokens, lightTheme as defaultLightTokens };

export function tokensForTheme(theme: "dark" | "light" = "dark"): DesignTokens {
  return theme === "light" ? lightTheme : darkTheme;
}
