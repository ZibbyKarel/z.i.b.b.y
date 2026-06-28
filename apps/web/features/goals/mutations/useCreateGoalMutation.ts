import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getGoalsQueryKey } from "../queries/useGoalsQuery";

/** Create a goal definition (`POST /api/goals`); refreshes the goals list. */
export const useCreateGoalMutation = makeInvalidatingMutation(
  apiClient.goals.createGoal.useMutation,
  getGoalsQueryKey,
);
