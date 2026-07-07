/**
 * Cache key for the activity feed (`GET /api/activity`). Exported so the SSE bridge
 * (`features/runs/runEvents.tsx`) can invalidate it and `useGenerateBriefingMutation`
 * can refresh it after posting a new entry.
 *
 * Phase 39 removed the last direct reader of this endpoint (the Overview
 * "Nedávná aktivita" card and the chat activity panel — the HUD right rail's own
 * `useActivityFeedInfiniteQuery` is the single ambient activity log now), so only
 * the key survives; a query hook can come back here if a consumer needs the plain,
 * non-paginated feed again.
 */
export function getActivityQueryKey() {
  return ["activity", "today"] as const;
}
