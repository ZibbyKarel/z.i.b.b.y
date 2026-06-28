import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** Approve a pending approval (`POST /api/approvals/:id/approve`); resumes the run. */
export const useApproveMutation = makeInvalidatingMutation(
  apiClient.approvals.approveApproval.useMutation,
  getApprovalsQueryKey,
);
