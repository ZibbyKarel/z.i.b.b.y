import { apiClient } from "../../../state/api";

/**
 * Send an operator turn (`POST /api/chat/messages`). Returns the ts-rest mutation
 * result directly; the body is `{ conversationId?, text }` and the 201 response is
 * `{ conversationId, turnId }`.
 *
 * Deliberately NO transcript invalidation here: at mutation success the assistant
 * reply doesn't exist yet — its tokens stream in afterward over SSE. The transcript
 * refetch fires on the stream's `done` event (see {@link useChatStream}), so we
 * never refetch an empty reply.
 */
export function useSendChatMessageMutation() {
  return apiClient.chat.sendMessage.useMutation();
}
