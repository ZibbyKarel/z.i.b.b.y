"use client";

import { DesignSystemProvider, THEME_STORAGE_KEY, type ThemeChoice } from "@zibby/design-system";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";

/** `localStorage` key the reduced-motion opt-in persists under (ZB-11 Appearance
 *  settings) — independent of the OS `prefers-reduced-motion` query; see the DS
 *  `[data-motion="reduced"]` override in `theme/globals.css`. */
const MOTION_STORAGE_KEY = "zibby-motion";
export type MotionChoice = "system" | "reduced";

function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function isMotionChoice(value: string | null): value is MotionChoice {
  return value === "system" || value === "reduced";
}

/** Reads a persisted choice once at mount — try/catch since `localStorage` can
 *  throw (private mode, disabled storage) and must never crash the app shell. */
function readStorage<T extends string>(
  key: string,
  isValid: (v: string | null) => v is T,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return isValid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

interface AppearanceContextValue {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  motion: MotionChoice;
  setMotion: (motion: MotionChoice) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * ZB-11 Appearance settings state, shell-global: theme (light/dark/system) and
 * reduced motion, both per-viewer `localStorage` convenience (no server round
 * trip — this is display preference, not domain data). Wraps `DesignSystemProvider`
 * directly so the resolved `theme` choice always drives the actual token swap;
 * `useAppearance()` is how `/system/settings/appearance` reads and writes both.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() =>
    readStorage(THEME_STORAGE_KEY, isThemeChoice, "system"),
  );
  const [motion, setMotionState] = useState<MotionChoice>(() =>
    readStorage(MOTION_STORAGE_KEY, isMotionChoice, "system"),
  );

  // `DesignSystemProvider` persists `theme` to `localStorage` itself on change —
  // this state only needs to hold the current choice and pass it down.
  const setTheme = (next: ThemeChoice) => setThemeState(next);

  const setMotion = (next: MotionChoice) => {
    setMotionState(next);
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the choice still applies for this session.
    }
  };

  useEffect(() => {
    if (motion === "reduced") {
      document.documentElement.setAttribute("data-motion", "reduced");
    } else {
      document.documentElement.removeAttribute("data-motion");
    }
  }, [motion]);

  return (
    <AppearanceContext.Provider value={{ theme, setTheme, motion, setMotion }}>
      <DesignSystemProvider theme={theme}>{children}</DesignSystemProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}
