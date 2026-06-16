import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { allTaskRunsKey } from "../../runs/queries/useRunsQuery";

/** Resume a parked goal run with an operator note
 * (`POST /api/tasks/runs/:runId/resume`); refreshes the feed. */
export function useResumeGoalRunMutation() {
  const qc = useQueryClient();
  return apiClient.taskRuns.resumeTaskRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: allTaskRunsKey }),
  });
}
