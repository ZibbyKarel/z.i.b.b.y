import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getReviewRulesQueryKey } from "../queries/useReviewRulesQuery";

const GLOBAL_SCOPE = "_global";

/**
 * Widen an active project rule to global scope (`POST
 * /review-rules/:projectId/:ruleId/promote`) — the `/policy/patterns` "Accept
 * as rule" action. Promotion moves the rule out of its project's scope and
 * into `_global`, so both cached scopes are invalidated on success.
 */
export function usePromoteReviewRuleMutation(projectId: string) {
  const queryClient = useQueryClient();
  return apiClient.reviewLearning.promoteReviewRule.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getReviewRulesQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: getReviewRulesQueryKey(GLOBAL_SCOPE) });
    },
  });
}
