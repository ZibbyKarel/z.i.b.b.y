import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { taskRunsRootKey } from "../queries/keys";

/** Resume a retries-parked workflow run with an operator note
 * (`POST /api/tasks/runs/:runId/resume`); refreshes the feed. */
export function useResumeWorkflowRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.resumeTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: taskRunsRootKey }),
  });
}
