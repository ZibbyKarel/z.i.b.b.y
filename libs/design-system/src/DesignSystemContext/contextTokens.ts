/**
 * Returns a PartialDesignTokens override that switches the active context accent.
 * Pass this as the `tokens` prop to DesignSystemProvider alongside the base theme.
 *
 * Home context → amber accent. Work context → sky/blue accent.
 */
import type { PartialDesignTokens } from "../tokens";

export type ContextName = "home" | "work";

export function contextTokens(context: ContextName): PartialDesignTokens {
  if (context === "work") {
    return {
      color: {
        accent: {
          active: "#5b8def",
          activeDim: "rgba(91,141,239,0.16)",
          activeContrast: "#0a0c10",
          activeGlow: "rgba(91,141,239,0.4)",
        },
        surface: {
          accentSoft: "rgba(91,141,239,0.16)",
          accentRing: "rgba(91,141,239,0.30)",
        },
      },
    };
  }
  // home (default)
  return {
    color: {
      accent: {
        active: "#f0b429",
        activeDim: "rgba(240,180,41,0.16)",
        activeContrast: "#0a0c10",
        activeGlow: "rgba(240,180,41,0.4)",
      },
      surface: {
        accentSoft: "rgba(240,180,41,0.16)",
        accentRing: "rgba(240,180,41,0.30)",
      },
    },
  };
}
