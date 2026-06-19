import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getScheduledTasksQueryKey } from "../queries/useScheduledTasksQuery";

/** Cancel a still-waiting scheduled task (`DELETE /api/tasks/scheduled/:id`). */
export function useCancelScheduledTaskMutation() {
  const qc = useQueryClient();
  return apiClient.tasks.cancelScheduledTask.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getScheduledTasksQueryKey() }),
  });
}
