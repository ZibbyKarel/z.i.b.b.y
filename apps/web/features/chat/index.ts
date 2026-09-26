// Only the engine and the shell-global dock's own components are exported
// (ZB-13 deleted the old `Screen`/`ChatScreen` full-page view entirely, along
// with the rest of the pre-ZB-12 chat chrome) — a barrel this narrow can't
// drag a whole view graph into every consumer or risk cycles.
export { ChatProvider, useChat, CHAT_SHORTCUT_KEY } from "./ChatContext";
export { ChatButton } from "./components/ChatButton";
export { CooDock } from "./components/CooDock";
export { useSendChatMessageMutation } from "./mutations";
export { useChatTranscriptQuery, getChatTranscriptQueryKey } from "./queries";
export { useChatStream } from "./hooks/useChatStream";
export type { ChatStreamState, CompletedTurn, ChatStreamHandlers } from "./hooks/useChatStream";
