"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ChatScreen } from "./components/ChatScreen";

/**
 * Modifier shortcut that toggles the chat overlay from anywhere. ⌘K is the global
 * search and bare `n` opens New Task, so chat takes ⌘/Ctrl+J (free).
 */
export const CHAT_SHORTCUT_KEY = "j";

interface ChatStore {
  /** Whether the chat overlay is showing. */
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const ChatContext = createContext<ChatStore | null>(null);

/**
 * Owns the chat overlay's open state and a global ⌘/Ctrl+J shortcut, and mounts
 * {@link ChatScreen} as a fullscreen overlay when open. Mount once, high in the
 * client tree (see {@link AppShell}). The analogue of the removed VoiceProvider.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The chord uses a modifier, so it's safe while typing; only intercept the
      // exact ⌘/Ctrl+J combination (no other modifiers).
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === CHAT_SHORTCUT_KEY) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const value = useMemo<ChatStore>(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

  return (
    <ChatContext.Provider value={value}>
      {children}
      {isOpen && <ChatScreen onClose={close} />}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
