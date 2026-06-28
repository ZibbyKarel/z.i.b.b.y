import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getScheduledTasksQueryKey } from "../queries/useScheduledTasksQuery";

/** Cancel a still-waiting scheduled task (`DELETE /api/tasks/scheduled/:id`). */
export const useCancelScheduledTaskMutation = makeInvalidatingMutation(
  apiClient.tasks.cancelScheduledTask.useMutation,
  getScheduledTasksQueryKey,
);
