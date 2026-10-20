import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { taskRunsRootKey } from "../../runs/queries/keys";
import { getScheduledTasksQueryKey } from "../queries/useScheduledTasksQuery";

/** Cancel a still-waiting task (`DELETE /api/tasks/scheduled/:id`). Refreshes the
 * scheduled list and the runs feed, so the card leaves the dock right away. */
export function useCancelScheduledTaskMutation() {
  const queryClient = useQueryClient();
  return apiClient.tasks.cancelScheduledTask.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getScheduledTasksQueryKey() });
      void queryClient.invalidateQueries({ queryKey: taskRunsRootKey });
    },
  });
}
