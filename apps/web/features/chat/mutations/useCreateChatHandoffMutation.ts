import { apiClient } from "../../../state/api";

/**
 * "Create task" from chat (`POST /api/chat/handoff`): the server turns the
 * conversation up to the clicked reply into a task description that carries the
 * whole context (compacted when long) plus a reference to the on-disk transcript.
 * A pure read of the transcript — nothing to invalidate.
 */
export function useCreateChatHandoffMutation() {
  return apiClient.chat.createHandoff.useMutation();
}
