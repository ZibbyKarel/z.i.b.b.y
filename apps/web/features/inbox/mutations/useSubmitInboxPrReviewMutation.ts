import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * Post the operator's own GitHub review on a PR
 * (`POST /api/inbox/prs/:projectId/:number/reviews`). Invalidates the PR list.
 */
export function useSubmitInboxPrReviewMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.submitInboxPrReview.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
