import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one run's own diff. */
export function getTaskRunChangesQueryKey(runId: string) {
  return ["taskRuns", "changes", runId] as const;
}

/**
 * Read the changes a run made (`GET /api/tasks/runs/:runId/changes`). A run with no
 * changes source 404s — that is "no changes", so the view keys off `data` being absent.
 */
export function useTaskRunChangesQuery(runId: string, enabled = true) {
  return apiClient.taskRuns.getTaskRunChanges.useQuery({
    queryKey: getTaskRunChangesQueryKey(runId),
    queryData: { params: { runId } },
    enabled,
    retry: false,
    select: selectApiResponseBody,
  });
}
