import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a project search; keyed by the (trimmed) query. */
export function getProjectsSearchQueryKey(q: string) {
  return ["projects", "search", q] as const;
}

/**
 * Free-text project search (`GET /api/projects/search?q=`). Gated on a non-empty
 * query; returns the TanStack result directly with the envelope unwrapped to
 * `Project[]`. Feeds the "Projects" category of the topbar `GlobalSearch`.
 */
export function useProjectsSearchQuery(query: string) {
  const q = query.trim();
  return apiClient.projects.searchProjects.useQuery({
    queryKey: getProjectsSearchQueryKey(q),
    queryData: { query: { q } },
    enabled: q !== "",
    select: selectApiResponseBody,
  });
}
