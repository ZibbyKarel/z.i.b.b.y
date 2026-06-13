import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGoalRunsQueryKey } from "../queries/useGoalRunsQuery";

/** Start a run of a stored goal (`POST /api/goals/:id/run`); refreshes the feed. */
export function useStartGoalMutation() {
  const qc = useQueryClient();
  return apiClient.goalRuns.startGoalRun.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGoalRunsQueryKey() }),
  });
}
