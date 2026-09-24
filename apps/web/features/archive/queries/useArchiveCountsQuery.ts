import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the archive's department counts, scoped by (debounced) search. */
export function getArchiveCountsQueryKey(search: string) {
  return ["taskRuns", "archive", "counts", search] as const;
}

/**
 * Per-department archive counts (search-scoped) + the unsearched total — feeds
 * `ArchiveDepartmentFilter`'s per-option counts and the page's "archive is genuinely
 * empty" check. Independent of the department selection itself, same as the
 * (now-removed) client-side `computeDepartmentCounts` it replaces.
 */
export function useArchiveCountsQuery(search: string) {
  return apiClient.taskRuns.getArchivedTaskRunCounts.useQuery({
    queryKey: getArchiveCountsQueryKey(search),
    queryData: { query: search ? { search } : {} },
    select: selectApiResponseBody,
  });
}
