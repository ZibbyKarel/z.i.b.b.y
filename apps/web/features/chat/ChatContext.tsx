"use client";

import type { ChatMessage as ChatMessageType } from "@zibby/contracts";
import { usePathname, useRouter } from "next/navigation";
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
 * Modifier shortcut that jumps to the chat page from anywhere. ⌘K is the global
 * search and bare `n` opens New Task, so chat takes ⌘/Ctrl+J (free).
 */
export const CHAT_SHORTCUT_KEY = "j";

const CHAT_ROUTE = "/chat";
const CHAT_HOME_ROUTE = "/overview";

/** localStorage key the conversation id survives a full page reload under. */
const CHAT_CONVERSATION_KEY = "zibby.chat.conversationId";

/** SSR-guarded read — `null` covers both "no window yet" and "never set". */
function readStoredConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAT_CONVERSATION_KEY);
}

interface ChatStore {
  /** Navigate to `/chat`, minting a conversation if this thread doesn't have one yet. */
  open: () => void;
  /** Navigate away from `/chat`, back to the dashboard overview. */
  close: () => void;
  /** ⌘/Ctrl+J: jump to `/chat` from anywhere, or back out if already there. */
  toggle: () => void;
  /**
   * The conversation this thread owns. Minted once (lazily, the first time it's
   * needed) and then PRESERVED across navigating away from `/chat` and back, so
   * the operator can dip in and out without losing the thread — the same id keeps
   * `--resume`-ing ZIBBY's `claude` session. Only `newChat` mints a fresh id.
   */
  conversationId: string | null;
  /**
   * Mint a conversation id if this thread doesn't have one yet (idempotent). The
   * `/chat` route calls this on mount so a direct visit (URL, sidebar, bookmark)
   * always lands on a thread, not just the in-app open/⌘J trigger.
   */
  ensureConversation: () => void;
  /**
   * Adopt a conversation id without minting one — used by `/chat`'s mount
   * hydration to accept the server's authoritative id (e.g. the cold-start case
   * where localStorage is empty but the server already has an active thread).
   * Persisted the same way any other id change is.
   */
  setConversationId: Dispatch<SetStateAction<string | null>>;
  /** The transcript, lifted here so it survives `/chat` unmounting on navigation. */
  messages: ChatMessageType[];
  setMessages: Dispatch<SetStateAction<ChatMessageType[]>>;
  /** Start a fresh thread: clears the transcript and mints a new conversation id. */
  newChat: () => void;
}

const ChatContext = createContext<ChatStore | null>(null);

/**
 * Owns the chat conversation state — surviving `/chat` unmounting on navigation —
 * and a global ⌘/Ctrl+J shortcut. Mount once, high in the client tree (see
 * {@link AppShell}), above the `/chat` route so the transcript isn't lost when the
 * operator leaves and comes back. The chat surface itself is rendered by the
 * `/chat` route (`app/(dashboard)/chat/page.tsx` → `features/chat/Screen.tsx`), not
 * by this provider — it used to mount a fullscreen overlay here, but chat is now a
 * normal routed page inside the dashboard shell.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // The conversation owned by the current thread. Lazily initialised from
  // localStorage so a full page reload re-attaches to the same thread (rather than
  // minting a new one and orphaning the on-disk transcript + `--resume` session);
  // falls back to `null` (mint-on-demand via `ensureConversation`) the first time
  // this thread has ever opened chat, or on the server. Only `newChat` mints a
  // fresh id thereafter.
  const [conversationId, setConversationId] = useState<string | null>(readStoredConversationId);
  // The transcript lives here (above the `/chat` route) so it survives navigating
  // away — coming back to `/chat` shows the same conversation rather than a blank.
  // Reload hydration (from the persisted transcript) is wired by `Screen`, which
  // owns the `getTranscript` query and seeds this via `setMessages`.
  const [messages, setMessages] = useState<ChatMessageType[]>([]);

  // Keep localStorage in sync so the NEXT full reload finds this id — cleared
  // entirely when there's no conversation (nothing to resume).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversationId) {
      window.localStorage.setItem(CHAT_CONVERSATION_KEY, conversationId);
    } else {
      window.localStorage.removeItem(CHAT_CONVERSATION_KEY);
    }
  }, [conversationId]);

  const ensureConversation = useCallback(() => {
    setConversationId((id) => id ?? `conv_${crypto.randomUUID()}`);
  }, []);

  const open = useCallback(() => {
    ensureConversation();
    router.push(CHAT_ROUTE);
  }, [ensureConversation, router]);

  const close = useCallback(() => {
    router.push(CHAT_HOME_ROUTE);
  }, [router]);

  // "New chat" — drop the transcript and mint a fresh id so the next turn starts a
  // clean `claude` session (no `--resume`). Stays on `/chat`.
  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(`conv_${crypto.randomUUID()}`);
  }, []);

  const toggle = useCallback(() => {
    if (pathname === CHAT_ROUTE) {
      close();
    } else {
      open();
    }
  }, [pathname, close, open]);

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

  const value = useMemo<ChatStore>(
    () => ({
      open,
      close,
      toggle,
      conversationId,
      ensureConversation,
      setConversationId,
      messages,
      setMessages,
      newChat,
    }),
    [open, close, toggle, conversationId, ensureConversation, messages, newChat],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
