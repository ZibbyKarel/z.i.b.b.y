import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProposalsQueryKey } from "../queries/useProposalsQuery";

/**
 * Dismiss or edit a proposal (`PATCH /api/proposals/:id`). The widget shows a failure inline on
 * the row (`meta.inlineError` keeps the global toast quiet); success refreshes the list.
 */
export function useDecideProposalMutation() {
  const queryClient = useQueryClient();
  return apiClient.proposals.decideProposal.useMutation({
    meta: { inlineError: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getProposalsQueryKey() });
    },
  });
}
