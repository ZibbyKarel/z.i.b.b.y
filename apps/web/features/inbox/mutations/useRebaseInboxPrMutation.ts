import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * "Rebase" (`POST /api/inbox/prs/rebase`, todo-11): starts a `pr-rebase` task for one
 * of the operator's PRs. ZIBBY force-pushes the result with lease — right away when
 * conflict-free, after a Tier-3 approval when conflicts were resolved. Invalidates the
 * PR list so the row shows the running rebase.
 */
export function useRebaseInboxPrMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.rebaseInboxPr.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
