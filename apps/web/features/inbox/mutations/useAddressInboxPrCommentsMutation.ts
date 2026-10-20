import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * Address review comments (`POST /api/inbox/prs/address-comments`): starts a
 * `pr-address-comments` task; ZIBBY fast-forwards the fixes — right away for `Addressed: all`,
 * after a Tier-3 approval otherwise. Invalidates the PR list so the card shows the running task.
 */
export function useAddressInboxPrCommentsMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.addressInboxPrComments.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
