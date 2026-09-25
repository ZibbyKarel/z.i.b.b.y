"use client";

import type { ChatMessage as ChatMessageType, TaskTarget } from "@zibby/contracts";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Modifier shortcut that toggles the COO dock from anywhere. ⌘K is the command
 * palette and bare `n` opens New Task, so chat takes ⌘/Ctrl+J (free).
 */
export const CHAT_SHORTCUT_KEY = "j";

/** localStorage key the conversation id survives a full page reload under. */
const CHAT_CONVERSATION_KEY = "zibby.chat.conversationId";

/** SSR-guarded read — `null` covers "no window yet", "never set" and storage
 *  that throws (private window, blocked site data). */
function readStoredConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAT_CONVERSATION_KEY);
  } catch {
    return null;
  }
}

interface ChatStore {
  /**
   * Open the shell-global COO dock (ZB-12), minting a conversation if this thread
   * doesn't have one yet. `target` scopes the dock to an **explicit** destination
   * (O-20: a department page opens it pre-scoped to that department — "explicit
   * target overrides the classifier"); omitting it keeps whatever scope is set.
   */
  open: (target?: TaskTarget) => void;
  /** Whether the COO dock is expanded (transcript visible). */
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  /**
   * The dock's explicit routing scope. `null` = the COO (the classifier routes).
   * A per-turn `@`-mention in the composer still wins over this for that turn.
   */
  dockTarget: TaskTarget | null;
  setDockTarget: Dispatch<SetStateAction<TaskTarget | null>>;
  /**
   * The conversation this thread owns. Minted once (lazily, the first time it's
   * needed) and then PRESERVED across navigation, so the operator can dip in and
   * out without losing the thread — the same id keeps `--resume`-ing ZIBBY's
   * `claude` session. Only `newChat` mints a fresh id.
   */
  conversationId: string | null;
  /** Mint a conversation id if this thread doesn't have one yet (idempotent). */
  ensureConversation: () => void;
  /**
   * Adopt a conversation id without minting one — used by the dock's mount
   * hydration to accept the server's authoritative id (the cold-start case where
   * localStorage is empty but the server already has an active thread).
   */
  setConversationId: Dispatch<SetStateAction<string | null>>;
  /** The transcript, lifted here so it survives the dock collapsing. */
  messages: ChatMessageType[];
  setMessages: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation id. */
  newChat: () => void;
}

const ChatContext = createContext<ChatStore | null>(null);

/**
 * Owns the chat conversation state and the COO dock's open/scope state, plus the
 * global ⌘/Ctrl+J shortcut. Mounted once in {@link AppShell}; the dock itself
 * (`CooDock`) renders in the shell's `dock` slot on every route (ZB-12 — the
 * `/chat` page is retired and redirects to `/org`).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  // Lazily initialised from localStorage so a full page reload re-attaches to the
  // same thread (rather than minting a new one and orphaning the on-disk
  // transcript + `--resume` session). Only `newChat` mints a fresh id thereafter.
  const [conversationId, setConversationId] = useState<string | null>(readStoredConversationId);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTarget, setDockTarget] = useState<TaskTarget | null>(null);

  // Keep localStorage in sync so the NEXT full reload finds this id — cleared
  // entirely when there's no conversation (nothing to resume).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (conversationId) {
        window.localStorage.setItem(CHAT_CONVERSATION_KEY, conversationId);
      } else {
        window.localStorage.removeItem(CHAT_CONVERSATION_KEY);
      }
    } catch {
      // Storage unavailable — the thread still works, it just won't survive a reload.
    }
  }, [conversationId]);

  const ensureConversation = useCallback(() => {
    setConversationId((id) => id ?? `conv_${crypto.randomUUID()}`);
  }, []);

  const open = useCallback(
    (target?: TaskTarget) => {
      ensureConversation();
      if (target) setDockTarget(target);
      setDockOpen(true);
    },
    [ensureConversation],
  );

  // "New chat" — drop the transcript and mint a fresh id so the next turn starts a
  // clean `claude` session (no `--resume`).
  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(`conv_${crypto.randomUUID()}`);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The chord uses a modifier, so it's safe while typing; only intercept the
      // exact ⌘/Ctrl+J combination (no other modifiers). It toggles the dock.
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === CHAT_SHORTCUT_KEY) {
        e.preventDefault();
        ensureConversation();
        setDockOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ensureConversation]);

  const value = useMemo<ChatStore>(
    () => ({
      open,
      dockOpen,
      setDockOpen,
      dockTarget,
      setDockTarget,
      conversationId,
      ensureConversation,
      setConversationId,
      messages,
      setMessages,
      newChat,
    }),
    [open, dockOpen, dockTarget, conversationId, ensureConversation, messages, newChat],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
