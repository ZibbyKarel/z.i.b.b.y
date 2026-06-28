import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** Reject a pending approval (`POST /api/approvals/:id/reject`); terminates the run. */
export const useRejectMutation = makeInvalidatingMutation(
  apiClient.approvals.rejectApproval.useMutation,
  getApprovalsQueryKey,
);
