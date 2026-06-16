import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../queries/useRunsQuery";

/** Delete a pipeline run (`DELETE /api/tasks/runs/:runId`); erases its on-disk
 * artifacts and refreshes the feed on success. */
export function useDeletePipelineRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.deleteTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allTaskRunsKey }),
  });
}
