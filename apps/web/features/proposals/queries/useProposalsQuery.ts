import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the open proposals list. Exported so mutations and the SSE bridge can invalidate it. */
export function getProposalsQueryKey() {
  return ["proposals"] as const;
}

/**
 * Open, unexpired automation proposals (`GET /api/proposals`, high confidence first). No
 * polling: freshness comes from invalidation (decisions, activity SSE) plus a 5 min stale time.
 */
export function useProposalsQuery() {
  return apiClient.proposals.listProposals.useQuery({
    queryKey: getProposalsQueryKey(),
    select: selectApiResponseBody,
    staleTime: 5 * 60_000,
  });
}
