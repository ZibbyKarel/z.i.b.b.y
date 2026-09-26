import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getMemorySearchQueryKey(q: string) {
  return ["memory", "search", q] as const;
}

/** Index-first search (`GET /api/memory/search`), enabled only on a non-blank query. */
export function useMemorySearchQuery(q: string) {
  return apiClient.memory.search.useQuery({
    queryKey: getMemorySearchQueryKey(q),
    queryData: { query: { q } },
    enabled: q.trim().length > 0,
    select: selectApiResponseBody,
  });
}
