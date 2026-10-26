import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { invalidateAfterDecision } from "./invalidateAfterDecision";

/** Reject a pending approval (`POST /api/approvals/:id/reject`); terminates the run. */
export function useRejectMutation() {
  const queryClient = useQueryClient();
  return apiClient.approvals.rejectApproval.useMutation({
    onSuccess: () => invalidateAfterDecision(queryClient),
  });
}
