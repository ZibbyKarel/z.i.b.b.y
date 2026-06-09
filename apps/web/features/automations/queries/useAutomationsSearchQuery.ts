import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for an automation search; keyed by the (trimmed) query. */
export function getAutomationsSearchQueryKey(q: string) {
  return ["automations", "search", q] as const;
}

/**
 * Free-text automation search (`GET /api/automations/search?q=`). Gated on a
 * non-empty query; returns the TanStack result directly with the envelope
 * unwrapped to `Automation[]`. Feeds the "Automations" category of the topbar
 * `GlobalSearch`.
 */
export function useAutomationsSearchQuery(query: string) {
  const q = query.trim();
  return apiClient.automations.searchAutomations.useQuery({
    queryKey: getAutomationsSearchQueryKey(q),
    queryData: { query: { q } },
    enabled: q !== "",
    select: selectApiResponseBody,
  });
}
