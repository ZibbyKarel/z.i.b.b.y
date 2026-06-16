import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../queries/useRunsQuery";

/** Resume a retries-parked pipeline run with an operator note
 * (`POST /api/tasks/runs/:runId/resume`); refreshes the feed. */
export function useResumePipelineRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.resumeTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allTaskRunsKey }),
  });
}
