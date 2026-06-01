import { useContext } from "react";
import { spacingValues, type Spacing, type Theme } from "../tokens";
import { DesignSystemTokenContext } from "./DesignSystemProvider";
import { defaultDarkTokens } from "./themeRegistry";

/**
 * Returns the active Theme object from DesignSystemProvider context.
 * Fallback: dark theme defaults (safe outside Provider, e.g. in tests).
 *
 * Prefer Tailwind classes for all visual styling. Use this hook only when
 * a raw JS value is required (SVG attributes, canvas drawing, etc.).
 */
export function useTokens(): Theme {
  return useContext(DesignSystemTokenContext) ?? defaultDarkTokens;
}

/** Returns the resolved px value for a spacing token. */
export function useSpacing(token: Spacing): string {
  return spacingValues[token];
}
