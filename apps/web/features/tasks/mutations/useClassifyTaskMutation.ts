import { apiClient } from "../../../state/api";

/**
 * Classify a free-text task (`POST /api/tasks/classify`). Read-only on the
 * server (it never starts a run), so there's nothing to invalidate. Call sites
 * map the response body with `toClientRouting` and drive the dialog's FSM from
 * the mutation's pending/success states.
 */
export function useClassifyTaskMutation() {
  return apiClient.tasks.classifyTask.useMutation();
}
