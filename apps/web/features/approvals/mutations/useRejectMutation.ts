import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** Reject a pending approval (`POST /api/approvals/:id/reject`); terminates the run. */
export function useRejectMutation() {
  const qc = useQueryClient();
  return apiClient.approvals.rejectApproval.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getApprovalsQueryKey() }),
  });
}
