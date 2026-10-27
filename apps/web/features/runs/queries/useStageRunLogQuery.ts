import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one workflow stage's log (the most recent attempt, or the finished attempt `stageRunId`). */
export function getStageRunLogQueryKey(
  workflowRunId: string,
  phaseId: string,
  stageRunId?: string,
) {
  return ["workflowRuns", "stageLog", workflowRunId, phaseId, stageRunId ?? "latest"] as const;
}

/**
 * Read a **terminal** workflow stage's log from offset 0
 * (`GET /api/tasks/runs/:runId/stages/:phaseId/logs`) — a one-shot read of state;
 * nothing appends to a finished phase. The phase that is still executing is a live
 * stream and is tailed over SSE instead (`useStageRunLogStream` — DNA: SSE for
 * live streams, polling for state).
 */
export function useStageRunLogQuery(
  workflowRunId: string,
  phaseId: string | undefined,
  stageRunId?: string,
) {
  return apiClient.taskRuns.getTaskRunStageLogs.useQuery({
    queryKey: getStageRunLogQueryKey(workflowRunId, phaseId ?? "none", stageRunId),
    queryData: {
      params: { runId: workflowRunId, phaseId: phaseId ?? "" },
      query: stageRunId ? { stageRunId } : {},
    },
    enabled: Boolean(phaseId),
    // a finished attempt never changes
    ...(stageRunId && { staleTime: Infinity }),
    select: selectApiResponseBody,
  });
}
