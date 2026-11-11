import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrReviewersQueryKey } from "../queries/useInboxPrReviewersQuery";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * Re-request one person's review (`POST /api/inbox/prs/:projectId/:number/reviewers/request`).
 * Seeds the PR's reviewers cache with the returned tree and refetches the PR list.
 */
export function useRequestInboxPrReviewMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.requestInboxPrReview.useMutation({
    onSuccess: (res, { params }) => {
      qc.setQueryData(getInboxPrReviewersQueryKey(params.projectId, Number(params.number)), res);
      return qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
