import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the chat transcript. A `conversationId` of `undefined`
 * targets the single active conversation (the MVP one-thread default); the key
 * still distinguishes it from a future explicit id so an invalidation is precise.
 */
export function getChatTranscriptQueryKey(conversationId?: string) {
  return ["chat", "transcript", conversationId ?? "active"] as const;
}

/**
 * Read the conversation transcript (`GET /api/chat/transcript`). Returns the
 * TanStack query result directly; `select` strips the ts-rest envelope so `data`
 * is the contract `ChatTranscript` once a fetch lands. The result always carries a
 * non-optional `conversationId`, so this query bootstraps the id the live SSE
 * stream and the send mutation both need. Call sites read `data?.messages ?? []`.
 */
export function useChatTranscriptQuery(conversationId?: string) {
  return apiClient.chat.getTranscript.useQuery({
    queryKey: getChatTranscriptQueryKey(conversationId),
    queryData: { query: conversationId ? { conversationId } : {} },
    select: selectApiResponseBody,
  });
}
