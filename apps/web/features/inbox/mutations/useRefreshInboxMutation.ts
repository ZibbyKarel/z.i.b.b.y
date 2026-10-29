import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxItemsQueryKey } from "../queries/useInboxItemsQuery";
import { getInboxPrsQueryKey } from "../queries/useInboxPrsQuery";

/**
 * "Sync" = bypass the API's live-fetch cache: refetches the issue list and the PR
 * list with `refresh=true` and writes both responses straight into their query
 * caches. A failed list leaves the previous data in place; the mutation rejects.
 */
export function useRefreshInboxMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const query = { refresh: "true" } as const;
      const [items, prs] = await Promise.all([
        apiClient.inbox.listInboxItems.query({ query }),
        apiClient.inbox.listInboxPrs.query({ query }),
      ]);
      if (items.status === 200) qc.setQueryData(getInboxItemsQueryKey(), items);
      if (prs.status === 200) qc.setQueryData(getInboxPrsQueryKey(), prs);
      if (items.status !== 200 || prs.status !== 200) throw new Error("inbox refresh failed");
    },
  });
}
