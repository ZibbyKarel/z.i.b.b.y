import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the activity feed. Exported so the SSE bridge can invalidate it. */
export function getActivityQueryKey() {
  return ["activity", "today"] as const;
}

/**
 * Recent recorded activity from `GET /api/activity` — the overview feed. Read-only
 * (entries are born only inside the API). No `refetchInterval`: the SSE `activity`
 * scope invalidates this key the instant a new entry lands, so the feed stays live
 * without polling.
 */
export function useActivityQuery() {
  return apiClient.activity.listActivity.useQuery({
    queryKey: getActivityQueryKey(),
    queryData: { query: {} },
    select: selectApiResponseBody,
  });
}
