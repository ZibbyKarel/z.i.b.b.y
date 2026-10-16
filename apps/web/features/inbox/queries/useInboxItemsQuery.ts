import { MINUTE_MS } from "../../../utils/time";
import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the cross-project inbox item list. */
export function getInboxItemsQueryKey() {
  return ["inbox", "items"] as const;
}

/**
 * The operator's roadmap items across all projects (`GET /api/roadmap/items`) —
 * already scoped to "mine" on the server; filtering and search run on the client.
 * `data` is the `InboxItemsResponse` body (`items`, `epics`, `syncProjectIds`,
 * `syncedAt`, `errors`).
 */
export function useInboxItemsQuery(options?: { enabled?: boolean }) {
  return apiClient.inbox.listInboxItems.useQuery({
    queryKey: getInboxItemsQueryKey(),
    select: selectApiResponseBody,
    enabled: options?.enabled,
    // Picks up the API's 15-min roadmap tick.
    refetchInterval: 15 * MINUTE_MS,
  });
}
