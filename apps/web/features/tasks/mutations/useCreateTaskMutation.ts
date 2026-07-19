import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getRunningAgentsQueryKey } from "../../agents/queries/keys";
import { allTaskRunsKey } from "../../runs/queries/keys";
import { getScheduledTasksQueryKey } from "../queries/useScheduledTasksQuery";

/**
 * Create a task (`POST /api/tasks`): the interactive path returns an immediate
 * `pending` task (its run spawns in the background), or schedules for a future
 * `scheduledAt`. Refreshes the unified runs feed (so the pending card shows up the
 * moment we redirect to `/archiv`, F8d — `/runs` is deleted), the running-agents
 * list and the scheduled-task queue.
 */
export function useCreateTaskMutation() {
  const qc = useQueryClient();
  return apiClient.tasks.createTask.useMutation({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: allTaskRunsKey });
      qc.invalidateQueries({ queryKey: getRunningAgentsQueryKey() });
      qc.invalidateQueries({ queryKey: getScheduledTasksQueryKey() });
    },
  });
}
