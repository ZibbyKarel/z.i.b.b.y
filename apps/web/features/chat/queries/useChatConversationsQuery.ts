import { keepPreviousData } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the chat history list (per search term). */
export function getChatConversationsQueryKey(q?: string) {
  return ["chat", "conversations", q ?? ""] as const;
}

/** Past conversations for the dock's history sidebar (`GET /api/chat/conversations`), newest first. */
export function useChatConversationsQuery(q?: string) {
  return apiClient.chat.listConversations.useQuery({
    queryKey: getChatConversationsQueryKey(q),
    queryData: { query: q ? { q } : {} },
    placeholderData: keepPreviousData,
    select: selectApiResponseBody,
  });
}
