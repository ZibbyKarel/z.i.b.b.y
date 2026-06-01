/**
 * Returns a PartialTheme override that switches the active context accent.
 * Pass this as the `tokens` prop to DesignSystemProvider alongside the base theme.
 *
 * Home context → amber accent. Work context → sky/blue accent.
 */
import type { PartialTheme } from "../src/tokens";

export type ContextName = "home" | "work";

export function contextTokens(context: ContextName): PartialTheme {
  if (context === "work") {
    return {
      colorAccent: "#5b8def",
      colorAccentDim: "rgba(91,141,239,0.16)",
      colorAccentContrast: "#0a0c10",
      colorAccentGlow: "rgba(91,141,239,0.4)",
      shadowGlowAccent: "0 0 16px rgba(91,141,239,0.4)",
    };
  }
  return {
    colorAccent: "#f0b429",
    colorAccentDim: "rgba(240,180,41,0.16)",
    colorAccentContrast: "#0a0c10",
    colorAccentGlow: "rgba(240,180,41,0.4)",
    shadowGlowAccent: "0 0 16px rgba(240,180,41,0.4)",
  };
}
