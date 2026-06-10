import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a skill search; keyed by the (trimmed) query. */
export function getSkillsSearchQueryKey(q: string) {
  return ["skills", "search", q] as const;
}

/**
 * Free-text skill search (`GET /api/skills/search?q=`). Gated on a non-empty
 * query; returns the TanStack result directly with the envelope unwrapped to
 * `Skill[]`. Feeds the "Skills" category of the topbar `GlobalSearch`.
 */
export function useSkillsSearchQuery(query: string) {
  const q = query.trim();
  return apiClient.skills.searchSkills.useQuery({
    queryKey: getSkillsSearchQueryKey(q),
    queryData: { query: { q } },
    enabled: q !== "",
    select: selectApiResponseBody,
  });
}
