import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the RightRail activity-log display config. */
export function getActivityViewQueryKey() {
  return ["activityView"] as const;
}

/**
 * The RightRail live-log display config from `GET /api/activity/view` (seeded
 * default if absent) — which activity groups are visible / grouped / hidden. Read by
 * the rail and edited in Settings → Activity.
 */
export function useActivityViewQuery() {
  return apiClient.activityView.getActivityView.useQuery({
    queryKey: getActivityViewQueryKey(),
    select: selectApiResponseBody,
  });
}
