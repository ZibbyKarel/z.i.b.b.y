import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * "Do code review" (`POST /api/inbox/prs/review`, Phase 129 P2): starts a
 * `code-reviewer` task for one PR. The review is posted to GitHub only after the
 * operator approves the parked `pr-review` approval. Invalidates the PR list so the
 * row shows the running review.
 */
export function useReviewInboxPrMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.reviewInboxPr.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
