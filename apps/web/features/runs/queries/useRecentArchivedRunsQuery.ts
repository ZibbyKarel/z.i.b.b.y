import type { ArchivePage } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** Cache key for the dock's "Hotové" list. Lives under `["taskRuns"]` so the shared
 * root invalidation refreshes it too; the SSE terminal hook invalidates it by this key. */
export function getRecentArchivedRunsQueryKey(limit: number) {
  return ["taskRuns", "archive", "recent", limit] as const;
}

/** The newest `limit` archived runs (done, error, interrupted, parked) — newest first. */
export function useRecentArchivedRunsQuery(limit: number) {
  return apiClient.taskRuns.listArchivedTaskRuns.useQuery({
    queryKey: getRecentArchivedRunsQueryKey(limit),
    queryData: { query: { limit } },
    select: (res: { status: 200; body: ArchivePage }) => res.body.items,
  });
}
