import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { taskRunsRootKey } from "./keys";

/** Cache key for a workflow run's folder listing — under the task-run root so run transitions refresh it. */
export function getTaskRunFilesQueryKey(runId: string) {
  return [...taskRunsRootKey, "files", runId] as const;
}

/**
 * List a workflow run's folder (`GET /api/tasks/runs/:runId/files`) — a read-only
 * tree of paths, no file contents.
 */
export function useTaskRunFilesQuery(runId: string, enabled: boolean) {
  return apiClient.taskRuns.listTaskRunFiles.useQuery({
    queryKey: getTaskRunFilesQueryKey(runId),
    queryData: { params: { runId } },
    enabled,
    select: selectApiResponseBody,
  });
}
