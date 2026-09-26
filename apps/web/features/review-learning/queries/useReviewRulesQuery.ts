import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for one scope's review rules; exported so the promote
 *  mutation can invalidate both the project scope and `_global`. */
export function getReviewRulesQueryKey(scope: string) {
  return ["review-rules", scope] as const;
}

/**
 * Learned review rules in one scope (`GET /api/review-rules?scope=`) — a
 * project id, or `_global`. `/policy/patterns` (ZB-08) reads every project's
 * scope plus `_global` and flattens them into one `PatternCard` list.
 */
export function useReviewRulesQuery(scope: string) {
  return apiClient.reviewLearning.listReviewRules.useQuery({
    queryKey: getReviewRulesQueryKey(scope),
    queryData: { query: { scope } },
    select: selectApiResponseBody,
  });
}
