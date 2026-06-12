import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the channel-items inbox. Exported so the SSE bridge can invalidate it. */
export function getChannelItemsQueryKey() {
  return ["channels", "items"] as const;
}

/**
 * Recent ingested channel items from `GET /api/channels/items` — the inbox feed on
 * /integrations. Read-only (items mutate only via the watcher/triage paths). The
 * SSE `channel-items` scope invalidates this key so the inbox updates live.
 */
export function useChannelItemsQuery() {
  return apiClient.channels.listChannelItems.useQuery({
    queryKey: getChannelItemsQueryKey(),
    queryData: { query: {} },
    select: selectApiResponseBody,
  });
}
