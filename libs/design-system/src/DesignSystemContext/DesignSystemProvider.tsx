"use client";

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Density,
  type PartialTheme,
  type Theme,
  mergeTheme,
  tokensToCssVars,
} from "../tokens";
import { tokensForTheme } from "./themeRegistry";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const DesignSystemTokenContext = createContext<Theme | null>(null);

/** `localStorage` key the resolved theme choice persists under — read by the
 * inline `ThemeScript` (see `ThemeScript.tsx`) before hydration to avoid a flash. */
export const THEME_STORAGE_KEY = "zibby-theme";

/** `localStorage` cache of the density (source of truth is the operator's server
 * config) — read by `ThemeScript` before hydration so the first paint is right. */
export const DENSITY_STORAGE_KEY = "zibby-density";

/** `light`/`dark` are explicit; `system` follows `prefers-color-scheme` and updates
 * live if the OS preference changes while the app is open. */
export type ResolvedTheme = "light" | "dark";
export type ThemeChoice = ResolvedTheme | "system";

/** The provider's resolved `light`/`dark` (what is actually on screen, `system`
 *  already resolved) — read via `useResolvedTheme()`. */
export const DesignSystemResolvedThemeContext = createContext<ResolvedTheme | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface DesignSystemProviderProps {
  theme?: ThemeChoice;
  /** System-wide layout density (`data-density`); scales `--sp-*` spacing.
   *  Omitted → the provider leaves whatever `ThemeScript` put on `<html>` (e.g. while
   *  the operator's setting is still loading), so there is no flash to a default. */
  density?: Density;
  /** Partial token overrides. */
  tokens?: PartialTheme;
  layout?: "block" | "flex";
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

/**
 * Wraps children in a design-system root div. Injects all theme values as CSS
 * custom properties and makes the merged Theme available via Context hooks.
 *
 * - Sets `data-theme` on its own root (so the Tailwind `dark:` variant works via
 *   @custom-variant) **and** syncs it onto `<html>` — see `ThemeScript` for the
 *   paired no-flash inline script that sets `<html data-theme>` before hydration;
 *   this effect keeps it correct afterwards (including live `system` changes).
 * - `theme="system"` resolves via `prefers-color-scheme` and re-resolves on change.
 * - Persists the raw `theme` choice to `localStorage` (try/catch — private mode /
 *   disabled storage must not throw) so a future theme switcher's choice survives
 *   a reload; deterministic on first render either way (SSR-safe, no hydration
 *   mismatch — the initial resolved theme never reads `localStorage` synchronously).
 * - Sets `data-density` the same way (root + `<html>`) and caches it under
 *   `DENSITY_STORAGE_KEY` for `ThemeScript`'s pre-hydration pass.
 * - `h-full` is load-bearing: the dashboard shell relies on a full-height chain.
 * - Does NOT import globals.css — the app and Storybook link it independently.
 */
export function DesignSystemProvider({
  theme = "dark",
  density,
  tokens: override,
  layout,
  style,
  className,
  children,
}: DesignSystemProviderProps) {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    theme === "system" ? "dark" : theme,
  );

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = () => setSystemTheme(resolveSystemTheme());
    applySystemTheme();
    mql.addEventListener("change", applySystemTheme);
    return () => mql.removeEventListener("change", applySystemTheme);
  }, [theme]);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable (private mode, disabled cookies, SSR edge cases) — the
      // theme still applies for this session, it just won't survive a reload.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!density) return;
    document.documentElement.setAttribute("data-density", density);
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
      // Storage unavailable — density still applies; only the no-flash cache is lost.
    }
  }, [density]);

  const merged = useMemo(
    () =>
      override
        ? mergeTheme(tokensForTheme(resolvedTheme), override)
        : tokensForTheme(resolvedTheme),
    [resolvedTheme, override],
  );

  const cssVars = useMemo(() => tokensToCssVars(merged), [merged]);

  const rootStyle: CSSProperties = {
    ...(cssVars as CSSProperties),
    height: "100%",
    display: layout === "flex" ? "flex" : undefined,
    ...style,
  };

  const classes = ["ds-root", resolvedTheme === "dark" ? "dark" : "light", className]
    .filter(Boolean)
    .join(" ");

  return (
    <DesignSystemTokenContext.Provider value={merged}>
      <DesignSystemResolvedThemeContext.Provider value={resolvedTheme}>
        <div
          className={classes}
          data-density={density}
          data-theme={resolvedTheme}
          style={rootStyle}
        >
          {children}
        </div>
      </DesignSystemResolvedThemeContext.Provider>
    </DesignSystemTokenContext.Provider>
  );
}
