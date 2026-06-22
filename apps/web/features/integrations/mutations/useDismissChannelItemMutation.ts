import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getChannelItemsQueryKey } from "../queries/useChannelItemsQuery";

/**
 * Dismiss a surfaced channel item (`POST /api/channels/items/:id/dismiss`) — the
 * operator acknowledging a notify-only item so it leaves the "needs your attention"
 * list. Invalidates the inbox query so the card disappears immediately; the SSE
 * `channel-items` scope keeps other clients in sync.
 */
export function useDismissChannelItemMutation() {
  const qc = useQueryClient();
  return apiClient.channels.dismissChannelItem.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getChannelItemsQueryKey() }),
  });
}
