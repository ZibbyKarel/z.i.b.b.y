"use client";

import { useEffect } from "react";
import { useChat } from "./ChatContext";
import { ChatScreen } from "./components/ChatScreen";

/**
 * The `/chat` route's screen — pulls the conversation state {@link ChatProvider}
 * owns (so it survives navigating away and back) and renders the chat surface.
 * Landing on this route by any path other than the in-app open/⌘J trigger (a
 * direct URL, a bookmark, the sidebar) still needs a conversation to talk to, so
 * this ensures one exists on mount.
 */
export function Screen() {
  const { conversationId, ensureConversation, messages, setMessages, newChat, close } = useChat();

  useEffect(() => {
    ensureConversation();
  }, [ensureConversation]);

  return (
    <ChatScreen
      conversationId={conversationId}
      messages={messages}
      onClose={close}
      onMessagesChange={setMessages}
      onNewChat={newChat}
    />
  );
}
