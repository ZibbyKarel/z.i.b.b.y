import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the archive's department counts, scoped by (debounced) search. */
export function getArchiveCountsQueryKey(search: string, statuses: readonly string[] = []) {
  return ["taskRuns", "archive", "counts", search, [...statuses].sort().join(",")] as const;
}

/**
 * Per-department archive counts (search-scoped) + the unsearched total — feeds
 * `ArchiveDepartmentFilter`'s per-option counts and the page's "archive is genuinely
 * empty" check. Independent of the department selection itself, same as the
 * (now-removed) client-side `computeDepartmentCounts` it replaces.
 */
export function useArchiveCountsQuery(search: string, statuses: readonly string[] = []) {
  return apiClient.taskRuns.getArchivedTaskRunCounts.useQuery({
    queryKey: getArchiveCountsQueryKey(search, statuses),
    queryData: {
      query: {
        ...(search ? { search } : {}),
        ...(statuses.length ? { statuses: statuses.join(",") } : {}),
      },
    },
    select: selectApiResponseBody,
  });
}
