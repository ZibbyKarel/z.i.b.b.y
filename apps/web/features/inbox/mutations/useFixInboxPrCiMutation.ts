import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * "Fix CI" (`POST /api/inbox/prs/fix-ci`): starts a `pr-fix-ci` task for a PR with failing
 * checks. Invalidates the PR list so the row shows the running fix.
 */
export function useFixInboxPrCiMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.fixInboxPrCi.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
