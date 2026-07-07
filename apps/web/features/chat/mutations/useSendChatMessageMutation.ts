import { apiClient } from "../../../state/api";

/**
 * Send an operator turn (`POST /api/chat/messages`). Returns the ts-rest mutation
 * result directly; the body is `{ conversationId?, text }` and the 201 response is
 * `{ conversationId, turnId }`.
 *
 * Deliberately NO transcript invalidation here: at mutation success the assistant
 * reply doesn't exist yet — its tokens stream in afterward over SSE, and the
 * completed turn is appended straight to client state from `onComplete` (see
 * {@link useChatStream}), never by refetching. The transcript query
 * ({@link useChatTranscriptQuery}) is only read once per conversation, on mount, to
 * re-hydrate after a full page reload — a mid-conversation refetch here would
 * refetch an empty reply and flash the transcript blank.
 */
export function useSendChatMessageMutation() {
  return apiClient.chat.sendMessage.useMutation();
}
