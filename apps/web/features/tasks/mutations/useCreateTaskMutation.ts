import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRunningAgentsQueryKey } from "../../agents/queries/useRunningAgentsQuery";
import { getScheduledTasksQueryKey } from "../queries/useScheduledTasksQuery";

/**
 * Create a task (`POST /api/tasks`): classify + dispatch now, or schedule for a
 * future `scheduledAt`. Refreshes the running-agents list (an immediate dispatch
 * starts a run) and the scheduled-task queue (a deferred one adds to it).
 */
export function useCreateTaskMutation() {
  const qc = useQueryClient();
  return apiClient.tasks.createTask.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
      qc.invalidateQueries({ queryKey: getScheduledTasksQueryKey() });
    },
  });
}
