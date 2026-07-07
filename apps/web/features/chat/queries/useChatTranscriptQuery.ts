import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the transcript of one conversation (or the active thread, when omitted). */
export function getChatTranscriptQueryKey(conversationId?: string) {
  return ["chat", "transcript", conversationId ?? null] as const;
}

/**
 * Read the persisted transcript (`GET /api/chat/transcript`) — a pure read of the
 * append-only JSONL the backend already keeps. Omitting `conversationId` resolves
 * the server's single active thread (`ChatTranscriptStore.ensureActive`), which is
 * exactly what a cold start with no local id needs. `retry: false` since a stale or
 * unknown id should fall through to the caller's own fallback (`ensureConversation`)
 * rather than hang retrying.
 */
export function useChatTranscriptQuery(conversationId?: string) {
  return apiClient.chat.getTranscript.useQuery({
    queryKey: getChatTranscriptQueryKey(conversationId),
    queryData: { query: conversationId ? { conversationId } : {} },
    retry: false,
    select: selectApiResponseBody,
  });
}
