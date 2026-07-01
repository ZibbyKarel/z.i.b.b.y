import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one pipeline stage's log (the most recent attempt of the phase). */
export function getStageRunLogQueryKey(pipelineRunId: string, phaseId: string) {
  return ["pipelineRuns", "stageLog", pipelineRunId, phaseId] as const;
}

/**
 * Read a **terminal** pipeline stage's log from offset 0
 * (`GET /api/tasks/runs/:runId/stages/:phaseId/logs`) — a one-shot read of state;
 * nothing appends to a finished phase. The phase that is still executing is a live
 * stream and is tailed over SSE instead (`useStageRunLogStream` — DNA: SSE for
 * live streams, polling for state).
 */
export function useStageRunLogQuery(pipelineRunId: string, phaseId: string | undefined) {
  return apiClient.taskRuns.getTaskRunStageLogs.useQuery({
    queryKey: getStageRunLogQueryKey(pipelineRunId, phaseId ?? "none"),
    queryData: { params: { runId: pipelineRunId, phaseId: phaseId ?? "" } },
    enabled: Boolean(phaseId),
    select: selectApiResponseBody,
  });
}
