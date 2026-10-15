import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxItemsQueryKey } from "../queries/useInboxItemsQuery";

/**
 * Hide / unhide one inbox item (`PUT /api/inbox/state`, keyed by the item's
 * source identity). Hiding is permanent and operator-personal. Invalidates the
 * item list, whose rows carry the `hidden` flag.
 */
export function useSetInboxHiddenMutation() {
  const qc = useQueryClient();
  return apiClient.inbox.setInboxHidden.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getInboxItemsQueryKey() });
    },
  });
}
