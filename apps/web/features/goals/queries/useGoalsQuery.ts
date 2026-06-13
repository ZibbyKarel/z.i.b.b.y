import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the goal-definitions list; exported so mutations can invalidate it. */
export function getGoalsQueryKey() {
  return ["goals"] as const;
}

/** Live goal catalog from `GET /api/goals`. Returns the `useQuery` result directly. */
export function useGoalsQuery() {
  return apiClient.goals.listGoals.useQuery({
    queryKey: getGoalsQueryKey(),
    select: selectApiResponseBody,
  });
}
