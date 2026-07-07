// Never re-export Screen (or ChatScreen, its view) — it would drag the whole
// chat view graph into every consumer and risk cycles; the `/chat` route imports
// it directly (see agents/Screen.tsx for the same convention).
export { ChatProvider, useChat, CHAT_SHORTCUT_KEY } from "./ChatContext";
export { ChatButton } from "./components/ChatButton";
export { useSendChatMessageMutation } from "./mutations";
export { useChatTranscriptQuery, getChatTranscriptQueryKey } from "./queries";
export { useChatStream } from "./hooks/useChatStream";
export type { ChatStreamState, CompletedTurn, ChatStreamHandlers } from "./hooks/useChatStream";
