import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allPipelineRunsKey } from "../queries/useRunsQuery";

/** Resume a retries-parked pipeline run with an operator note
 * (`POST /api/pipelines/runs/:pipelineRunId/resume`); refreshes the feed. */
export function useResumePipelineRunMutation() {
  const qc = useQueryClient();
  return apiClient.pipelineRuns.resumePipelineRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allPipelineRunsKey }),
  });
}
