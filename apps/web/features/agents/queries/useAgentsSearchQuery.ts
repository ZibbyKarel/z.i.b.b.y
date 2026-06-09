import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for an agent search; keyed by the (trimmed) query so each term is cached. */
export function getAgentsSearchQueryKey(q: string) {
  return ["agents", "search", q] as const;
}

/**
 * Free-text agent search (`GET /api/agents/search?q=`). Gated on a non-empty
 * query so an empty search bar issues no request; returns the TanStack result
 * directly with the envelope unwrapped to `Agent[]`. Used by the topbar
 * `GlobalSearch` to fill the "Agents" category.
 */
export function useAgentsSearchQuery(query: string) {
  const q = query.trim();
  return apiClient.agents.searchAgents.useQuery({
    queryKey: getAgentsSearchQueryKey(q),
    queryData: { query: { q } },
    enabled: q !== "",
    select: selectApiResponseBody,
  });
}
