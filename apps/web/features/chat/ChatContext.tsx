"use client";

import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
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
  // The conversation owned by the current thread. It is minted once (lazily, on the
  // first open) and then PRESERVED across close + reopen, so the operator can dip in
  // and out without losing the thread — the same id keeps `--resume`-ing ZIBBY's
  // `claude` session. Only `newChat` mints a fresh id to start over.
  const [conversationId, setConversationId] = useState<string | null>(null);
  // The transcript lives here (above {@link ChatScreen}) so it survives the overlay
  // unmounting on close — reopening shows the same conversation rather than a blank.
  const [messages, setMessages] = useState<ChatMessageType[]>([]);

  const open = useCallback(() => {
    // Mint only if we have no thread yet; an existing one is reused on reopen.
    setConversationId((id) => id ?? `conv_${crypto.randomUUID()}`);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  // "New chat" — drop the transcript and mint a fresh id so the next turn starts a
  // clean `claude` session (no `--resume`). The overlay stays open.
  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(`conv_${crypto.randomUUID()}`);
  }, []);
  const toggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      open();
    }
  }, [isOpen, open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The chord uses a modifier, so it's safe while typing; only intercept the
      // exact ⌘/Ctrl+J combination (no other modifiers).
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === CHAT_SHORTCUT_KEY) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  const value = useMemo<ChatStore>(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

  return (
    <ChatContext.Provider value={value}>
      {children}
      {isOpen && (
        <ChatScreen
          conversationId={conversationId}
          messages={messages}
          onClose={close}
          onMessagesChange={setMessages}
          onNewChat={newChat}
        />
      )}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
