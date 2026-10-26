import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateAfterDecision } from "./invalidateAfterDecision";

/**
 * Approve a pending approval (`POST /api/approvals/:id/approve`); resumes the run.
 * A `pr-review` / `pr-address-comments` approval posts to GitHub on resume, so the runs and the
 * inbox PR list refresh too.
 */
export function useApproveMutation() {
  const queryClient = useQueryClient();
  return apiClient.approvals.approveApproval.useMutation({
    onSuccess: () => invalidateAfterDecision(queryClient),
  });
}
