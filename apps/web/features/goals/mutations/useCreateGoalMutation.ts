import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getGoalsQueryKey } from "../queries/useGoalsQuery";

/** Create a goal definition (`POST /api/goals`); refreshes the goals list. */
export function useCreateGoalMutation() {
  const qc = useQueryClient();
  return apiClient.goals.createGoal.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getGoalsQueryKey() }),
  });
}
