import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for one pipeline stage's log (the most recent attempt of the phase). */
export function getStageRunLogQueryKey(pipelineRunId: string, phaseId: string) {
  return ["pipelineRuns", "stageLog", pipelineRunId, phaseId] as const;
}

/**
 * Read a pipeline stage's log from offset 0
 * (`GET /api/pipelines/runs/:id/stages/:phaseId/logs`). For a terminal stage this
 * is a one-shot read (nothing appends); pass `live` for the phase that is still
 * executing to re-read on an interval so the running log grows in place. The
 * backend resolves a live phase to its in-flight child (`currentStageRunId`).
 */
export function useStageRunLogQuery(
  pipelineRunId: string,
  phaseId: string | undefined,
  live = false,
) {
  return apiClient.pipelineRuns.getStageRunLogs.useQuery({
    queryKey: getStageRunLogQueryKey(pipelineRunId, phaseId ?? "none"),
    queryData: { params: { pipelineRunId, phaseId: phaseId ?? "" } },
    enabled: Boolean(phaseId),
    select: selectApiResponseBody,
    refetchInterval: live ? 1000 : false,
  });
}
