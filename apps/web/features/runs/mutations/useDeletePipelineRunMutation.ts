import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allPipelineRunsKey } from "../queries/useRunsQuery";

/** Delete a pipeline run (`DELETE /api/pipeline-runs/:pipelineRunId`); erases its
 * on-disk artifacts and refreshes the feed on success. */
export function useDeletePipelineRunMutation() {
  const qc = useQueryClient();
  return apiClient.pipelineRuns.deletePipelineRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allPipelineRunsKey }),
  });
}
