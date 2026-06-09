"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type VoiceShortcut,
  loadVoiceShortcut,
  matchesShortcut,
  saveVoiceShortcut,
} from "./shortcut";
import { VoiceScreen } from "./components/VoiceScreen";

interface VoiceStore {
  /** Whether the full-screen voice takeover is showing. */
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** The configured toggle shortcut (rebindable in settings). */
  shortcut: VoiceShortcut;
  setShortcut: (sc: VoiceShortcut) => void;
}

const VoiceContext = createContext<VoiceStore | null>(null);

/**
 * Owns the voice-mode toggle state and the rebindable keyboard shortcut, and
 * renders the voice takeover as a full-screen overlay above the HUD. A single
 * global `keydown` listener toggles the mode from anywhere in the cockpit (the
 * shortcut is read through a ref so the listener never re-registers). Mount this
 * once, high in the client tree (see {@link AppShell}).
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [shortcut, setShortcutState] = useState<VoiceShortcut>(loadVoiceShortcut);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const setShortcut = useCallback((sc: VoiceShortcut) => {
    setShortcutState(sc);
    saveVoiceShortcut(sc);
  }, []);

  // Always-current shortcut ref — lets the global listener stay registered once
  // instead of re-binding on every rebind (ref is synced in an effect, not in render).
  const scRef = useRef(shortcut);
  useEffect(() => {
    scRef.current = shortcut;
  }, [shortcut]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (matchesShortcut(e, scRef.current)) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo<VoiceStore>(
    () => ({ isOpen, open, close, toggle, shortcut, setShortcut }),
    [isOpen, open, close, toggle, shortcut, setShortcut],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      {isOpen && <VoiceScreen onExit={close} />}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceStore {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}
