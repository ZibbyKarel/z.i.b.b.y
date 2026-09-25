import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getGoalQueryKey(id: string) {
  return ["goals", id] as const;
}

/** Single goal definition by id (`GET /api/goals/:id`). */
export function useGoalQuery(id: string) {
  return apiClient.goals.getGoal.useQuery({
    queryKey: getGoalQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
