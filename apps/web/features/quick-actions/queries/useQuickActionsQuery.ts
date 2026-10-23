import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the quick actions. Exported so mutations can invalidate it. */
export function getQuickActionsQueryKey() {
  return ["quick-actions"] as const;
}

/** The operator-saved one-click tasks from `GET /api/quick-actions`. */
export function useQuickActionsQuery() {
  return apiClient.quickActions.getQuickActions.useQuery({
    queryKey: getQuickActionsQueryKey(),
    select: selectApiResponseBody,
  });
}
