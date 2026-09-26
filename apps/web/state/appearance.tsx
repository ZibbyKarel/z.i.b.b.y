"use client";

import { DesignSystemProvider, THEME_STORAGE_KEY, type ThemeChoice } from "@zibby/design-system";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server (a no-op there —
 * this only ever runs client-side anyway, `"use client"`). Not a value
 * difference (which would risk a hydration mismatch) — purely which effect
 * phase adopts the persisted choice, and it has to be the LAYOUT phase: layout
 * effects fire tree-wide, child-before-parent, strictly before any PASSIVE
 * effect anywhere in the tree — including `DesignSystemProvider`'s own
 * mount-time "persist `theme` to `localStorage`" effect, which is a child of
 * this provider. A plain `useEffect` here would lose that race on first mount
 * (child passive effects run before the parent's), so it would read back its
 * own default and silently clobber a real stored preference before ever
 * seeing it.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

/** Reads a persisted choice — try/catch since `localStorage` can throw
 *  (private mode, disabled storage) and must never crash the app shell. Called
 *  only from a `useEffect` (see `AppearanceProvider`), never from a `useState`
 *  initializer: the initializer runs during the CLIENT's hydration render too
 *  (not just real SSR), where `window` already exists, so a `typeof window`
 *  guard there doesn't stop it from reading a real stored value and diverging
 *  from the server's render — the exact hydration-mismatch bug this shape
 *  avoids (`DesignSystemProvider`'s own docblock states the same invariant:
 *  "the initial resolved theme never reads localStorage synchronously"). */
function readStorage<T extends string>(
  key: string,
  isValid: (v: string | null) => v is T,
): T | null {
  try {
    const stored = window.localStorage.getItem(key);
    return isValid(stored) ? stored : null;
  } catch {
    return null;
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
  // "system" for both: matches `DesignSystemProvider`'s own SSR-safe default
  // and `ThemeScript`'s fallback, so the client's hydration render is
  // identical to the server's — the real stored choice (if any) is applied
  // right after, in the mount effect below.
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [motion, setMotionState] = useState<MotionChoice>("system");

  useIsomorphicLayoutEffect(() => {
    // Mount-only, one-time "adopt the persisted choice" read (not a live
    // subscription — both setters below already write their own change).
    // Deliberately setState-in-effect: the state above is seeded with the
    // SSR-safe default on purpose (see its comment) specifically so this can
    // run post-hydration instead of during the shared initializer, so the one
    // extra (pre-paint) render this causes is the fix, not a symptom to avoid.
    const storedTheme = readStorage(THEME_STORAGE_KEY, isThemeChoice);

    if (storedTheme) setThemeState(storedTheme);
    const storedMotion = readStorage(MOTION_STORAGE_KEY, isMotionChoice);

    if (storedMotion) setMotionState(storedMotion);
  }, []);

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
