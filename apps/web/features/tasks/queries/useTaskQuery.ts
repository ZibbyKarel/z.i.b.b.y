import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single task's detail (`GET /api/tasks/:id`). */
export function getTaskQueryKey(taskId: string) {
  return ["tasks", "detail", taskId] as const;
}

/**
 * `/work/tasks/[id]`'s data source (ZB-04b): the full stored task plus its
 * subtasks summary. Polls at a moderate cadence — the task detail has no SSE
 * channel of its own yet (unlike the unified runs feed), so this is the
 * baseline freshness until one exists.
 */
export function useTaskQuery(taskId: string | undefined) {
  return apiClient.tasks.getTask.useQuery({
    queryKey: getTaskQueryKey(taskId ?? ""),
    queryData: { params: { id: taskId ?? "" } },
    enabled: Boolean(taskId),
    refetchInterval: 5_000,
    select: selectApiResponseBody,
  });
}
