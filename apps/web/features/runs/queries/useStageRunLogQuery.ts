import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one pipeline stage's log (the most recent attempt of the phase). */
export function getStageRunLogQueryKey(pipelineRunId: string, phaseId: string) {
  return ["pipelineRuns", "stageLog", pipelineRunId, phaseId] as const;
}

/**
 * Read a pipeline stage's log from offset 0
 * (`GET /api/pipelines/runs/:id/stages/:phaseId/logs`). Used by the parked
 * panel to show the failure tail of the phase that exhausted its retries —
 * a one-shot read, not a live stream (the run is parked, nothing appends).
 */
export function useStageRunLogQuery(pipelineRunId: string, phaseId: string | undefined) {
  return apiClient.pipelineRuns.getStageRunLogs.useQuery({
    queryKey: getStageRunLogQueryKey(pipelineRunId, phaseId ?? "none"),
    queryData: { params: { pipelineRunId, phaseId: phaseId ?? "" } },
    enabled: Boolean(phaseId),
    select: selectApiResponseBody,
  });
}
