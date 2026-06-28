import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getChannelItemsQueryKey } from "../queries/useChannelItemsQuery";

/**
 * Dismiss a surfaced channel item (`POST /api/channels/items/:id/dismiss`) — the
 * operator acknowledging a notify-only item so it leaves the "needs your attention"
 * list. Invalidates the inbox query so the card disappears immediately; the SSE
 * `channel-items` scope keeps other clients in sync.
 */
export const useDismissChannelItemMutation = makeInvalidatingMutation(
  apiClient.channels.dismissChannelItem.useMutation,
  getChannelItemsQueryKey,
);
