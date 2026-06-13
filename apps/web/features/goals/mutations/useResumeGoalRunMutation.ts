import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGoalRunsQueryKey } from "../queries/useGoalRunsQuery";

/** Resume a parked goal run with an operator note
 * (`POST /api/goals/runs/:goalRunId/resume`); refreshes the feed. */
export function useResumeGoalRunMutation() {
  const qc = useQueryClient();
  return apiClient.goalRuns.resumeGoalRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGoalRunsQueryKey() }),
  });
}
