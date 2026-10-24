import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProposalsQueryKey } from "../queries/useProposalsQuery";

/**
 * Dismiss or edit a proposal (`PATCH /api/proposals/:id`). The widget shows a failure inline on
 * the row (`meta.inlineError` keeps the global toast quiet); the list is refreshed on success AND failure (a 409 means the row is stale).
 */
export function useDecideProposalMutation() {
  const queryClient = useQueryClient();
  return apiClient.proposals.decideProposal.useMutation({
    meta: { inlineError: true },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getProposalsQueryKey() });
    },
  });
}
