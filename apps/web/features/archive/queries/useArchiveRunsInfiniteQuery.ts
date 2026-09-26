import type { InfiniteData } from "@tanstack/react-query";
import type { ArchivePage, TaskRun } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** ts-rest wraps every page in the `{ status, body }` envelope. */
type ArchivePageResponse = { status: 200; body: ArchivePage };

const PAGE_SIZE = 40;

export interface ArchiveRunsFilter {
  /** Debounced free-text query — the caller owns debouncing the raw input. */
  search: string;
  /** Department ids (or `NO_DEPARTMENT`) to narrow to; empty means "all departments". */
  departments: readonly string[];
}

/** Cache key for one archive filter combination — changing `search` or `departments`
 * naturally starts a fresh paginated query (a new key discards the old pages). */
export function getArchiveRunsQueryKey({ search, departments }: ArchiveRunsFilter) {
  return ["taskRuns", "archive", "list", search, [...departments].sort().join(",")] as const;
}

/** Flatten the loaded pages into one newest-first, runId-deduped run list. */
function selectArchiveRuns(data: InfiniteData<ArchivePageResponse>): TaskRun[] {
  const seen = new Set<string>();
  const out: TaskRun[] = [];
  for (const page of data.pages) {
    for (const run of page.body.items) {
      if (seen.has(run.runId)) continue;
      seen.add(run.runId);
      out.push(run);
    }
  }
  return out;
}

/**
 * The `/archiv` page's flat, lazy-loaded feed: `GET /api/tasks/runs/archive` walked
 * forward as an infinite query. The first page is the newest archived runs;
 * `fetchNextPage` pulls the next (older) page via the opaque `nextCursor`. Search and
 * department filtering both run server-side (`TaskRunsService.listArchivedTaskRuns`),
 * so they reach every archived run, not just whatever page has already loaded —
 * mirrors `useActivityFeedInfiniteQuery`'s cursor-walk shape.
 */
export function useArchiveRunsInfiniteQuery({ search, departments }: ArchiveRunsFilter) {
  return apiClient.taskRuns.listArchivedTaskRuns.useInfiniteQuery<TaskRun[], string | undefined>({
    queryKey: getArchiveRunsQueryKey({ search, departments }),
    queryData: ({ pageParam }) => ({
      query: {
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(departments.length ? { departments: departments.join(",") } : {}),
        ...(pageParam ? { before: pageParam } : {}),
      },
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: ArchivePageResponse) => lastPage.body.nextCursor ?? undefined,
    select: selectArchiveRuns,
  });
}
