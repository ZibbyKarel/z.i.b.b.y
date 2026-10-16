import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../../inbox/queries/useInboxPrsQuery";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/**
 * Approve a pending approval (`POST /api/approvals/:id/approve`); resumes the run.
 * A `pr-review` approval posts its review to GitHub on resume, so the inbox PR list
 * refreshes too.
 */
export function useApproveMutation() {
  const queryClient = useQueryClient();
  return apiClient.approvals.approveApproval.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getApprovalsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
