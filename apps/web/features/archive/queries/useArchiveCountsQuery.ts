import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the archive's subsystem counts, scoped by (debounced) search. */
export function getArchiveCountsQueryKey(search: string) {
  return ["taskRuns", "archive", "counts", search] as const;
}

/**
 * Per-subsystem archive counts (search-scoped) + the unsearched total — feeds
 * `ArchiveSubsystemFilter`'s per-option counts and the page's "archive is genuinely
 * empty" check. Independent of the subsystem selection itself, same as the
 * (now-removed) client-side `computeSubsystemCounts` it replaces.
 */
export function useArchiveCountsQuery(search: string) {
  return apiClient.taskRuns.getArchivedTaskRunCounts.useQuery({
    queryKey: getArchiveCountsQueryKey(search),
    queryData: { query: search ? { search } : {} },
    select: selectApiResponseBody,
  });
}
