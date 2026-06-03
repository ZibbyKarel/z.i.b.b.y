import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single pipeline run (polled while it executes). */
export function getPipelineRunQueryKey(pipelineRunId: string) {
  return ["pipelineRun", pipelineRunId] as const;
}

/**
 * Poll a pipeline run's aggregate (`GET /api/pipelines/runs/:id`) while it is
 * active. `enabled` gates the query on having an id; the 1s refetch advances the
 * PhaseChain as stages complete (polling, not SSE — the run sidecar is the truth).
 */
export function usePipelineRunQuery(pipelineRunId: string | null) {
  return apiClient.pipelineRuns.getPipelineRun.useQuery({
    queryKey: getPipelineRunQueryKey(pipelineRunId ?? "none"),
    queryData: { params: { pipelineRunId: pipelineRunId ?? "" } },
    enabled: pipelineRunId !== null,
    refetchInterval: 1000,
    select: selectApiResponseBody,
  });
}
