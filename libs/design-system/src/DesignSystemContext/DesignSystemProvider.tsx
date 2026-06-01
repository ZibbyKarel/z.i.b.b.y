"use client";

import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useMemo,
} from "react";
import {
  mergeTokens,
  tokensToCssVars,
  type DesignTokens,
  type PartialDesignTokens,
} from "../tokens";
import { tokensForTheme } from "./themeRegistry";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const DesignSystemTokenContext = createContext<DesignTokens | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface DesignSystemProviderProps {
  theme?: "dark" | "light";
  /** Partial token overrides — use contextTokens(context) for accent switching. */
  tokens?: PartialDesignTokens;
  layout?: "block" | "flex";
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps children in a design-system root div. Injects all token values as CSS
 * custom properties and makes the merged token set available via Context hooks.
 *
 * - Sets `data-theme` so the Tailwind `dark:` variant works via @custom-variant.
 * - `h-full` is load-bearing: the dashboard shell relies on a full-height chain.
 * - Does NOT import globals.css — the app and Storybook link it independently.
 */
export function DesignSystemProvider({
  theme = "dark",
  tokens: override,
  layout,
  style,
  className,
  children,
}: DesignSystemProviderProps) {
  const merged = useMemo(
    () =>
      override ? mergeTokens(tokensForTheme(theme), override) : tokensForTheme(theme),
    [theme, override],
  );

  const cssVars = useMemo(() => tokensToCssVars(merged), [merged]);

  const rootStyle: CSSProperties = {
    ...(cssVars as CSSProperties),
    height: "100%",
    display: layout === "flex" ? "flex" : undefined,
    ...style,
  };

  const classes = [
    "ds-root",
    theme === "dark" ? "dark" : "light",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <DesignSystemTokenContext.Provider value={merged}>
      <div
        className={classes}
        data-theme={theme}
        style={rootStyle}
      >
        {children}
      </div>
    </DesignSystemTokenContext.Provider>
  );
}
