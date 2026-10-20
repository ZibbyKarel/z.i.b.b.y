import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { taskRunsRootKey } from "../../runs/queries/keys";
import { getApprovalsQueryKey } from "../queries/useApprovalsQuery";

/**
 * Answer an agent's `operator.question` approval (`POST /api/approvals/:id/answer`):
 * the answer is stored and the run resumes, so both the queue and the run feed refresh.
 */
export function useAnswerApprovalMutation() {
  const queryClient = useQueryClient();
  return apiClient.approvals.answerApproval.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getApprovalsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: taskRunsRootKey });
    },
  });
}
