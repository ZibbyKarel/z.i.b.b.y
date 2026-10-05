import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/** Send a stage checkpoint back with a note (`POST /api/approvals/:id/revise`); the step re-runs. */
export const useReviseMutation = makeInvalidatingMutation(
  apiClient.approvals.reviseApproval.useMutation,
  getApprovalsQueryKey,
);
