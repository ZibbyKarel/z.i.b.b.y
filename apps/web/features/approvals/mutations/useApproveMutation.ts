import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** Approve a pending approval (`POST /api/approvals/:id/approve`); resumes the run. */
export function useApproveMutation() {
  const qc = useQueryClient();
  return apiClient.approvals.approveApproval.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getApprovalsQueryKey() }),
  });
}
