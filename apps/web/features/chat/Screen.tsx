"use client";

import { useEffect, useRef } from "react";
import { useChat } from "./ChatContext";
import { ChatScreen } from "./components/ChatScreen";
import { useChatTranscriptQuery } from "./queries/useChatTranscriptQuery";

/**
 * The `/chat` route's screen — pulls the conversation state {@link ChatProvider}
 * owns (so it survives navigating away and back) and renders the chat surface.
 * Landing on this route by any path other than the in-app open/⌘J trigger (a
 * direct URL, a bookmark, the sidebar) still needs a conversation to talk to, so
 * this ensures one exists on mount.
 *
 * On a full page reload `ChatProvider`'s state is gone (React remounts from
 * scratch), so this also re-hydrates the transcript from the server's durable
 * copy (`GET /api/chat/transcript`) — the fix for "history disappears on
 * reload": the JSONL was never the problem, nothing on the client ever read it
 * back. The server's `conversationId` is authoritative (it covers the cold-start
 * case where localStorage is empty but the server already has an active
 * thread), and a `hydratedFor` ref makes the seed one-shot per conversation so
 * it never clobbers live/optimistic messages already in state (navigating away
 * from `/chat` and back, or a background refetch mid-turn).
 */
export function Screen() {
  const { conversationId, ensureConversation, setConversationId, messages, setMessages, newChat } =
    useChat();

  useEffect(() => {
    ensureConversation();
  }, [ensureConversation]);

  const { data: transcript } = useChatTranscriptQuery(conversationId ?? undefined);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!transcript) return;
    if (hydratedFor.current === transcript.conversationId) return;
    hydratedFor.current = transcript.conversationId;
    setConversationId(transcript.conversationId);
    setMessages(transcript.messages);
  }, [transcript, setConversationId, setMessages]);

  return (
    <ChatScreen
      conversationId={conversationId}
      messages={messages}
      onMessagesChange={setMessages}
      onNewChat={newChat}
    />
  );
}
