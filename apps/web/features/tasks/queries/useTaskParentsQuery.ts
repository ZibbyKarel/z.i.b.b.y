import type { InfiniteData } from "@tanstack/react-query";
import type { DepartmentId, TaskParent, TaskParentState, TaskParentsPage } from "@zibby/contracts";
import { apiClient } from "../../../state/api";

/** ts-rest wraps every page in the `{ status, body }` envelope. */
type TaskParentsPageResponse = { status: 200; body: TaskParentsPage };

const PAGE_SIZE = 40;

export interface TaskParentsFilter {
  company?: string;
  project?: string;
  department?: DepartmentId;
  state?: TaskParentState;
  source?: TaskParent["source"];
}

/** Cache key for one filter combination — a new key discards stale pages. */
export function getTaskParentsQueryKey(filter: TaskParentsFilter) {
  return [
    "tasks",
    "parents",
    filter.company ?? "",
    filter.project ?? "",
    filter.department ?? "",
    filter.state ?? "",
    filter.source ?? "",
  ] as const;
}

/** Flatten the loaded pages into one newest-first, id-deduped parent list. */
function selectTaskParents(data: InfiniteData<TaskParentsPageResponse>): TaskParent[] {
  const seen = new Set<string>();
  const out: TaskParent[] = [];
  for (const page of data.pages) {
    for (const parent of page.body.items) {
      if (seen.has(parent.id)) continue;
      seen.add(parent.id);
      out.push(parent);
    }
  }
  return out;
}

/**
 * `/work/tasks`'s parent-task feed (ZB-04b): `GET /api/tasks/parents` walked
 * forward as an infinite query, mirroring `useArchiveRunsInfiniteQuery`'s
 * cursor-walk shape. Every filter (company/project/department/state/source)
 * runs server-side (`TaskParentsService`).
 */
export function useTaskParentsInfiniteQuery(filter: TaskParentsFilter) {
  return apiClient.tasks.getTaskParents.useInfiniteQuery<TaskParent[], string | undefined>({
    queryKey: getTaskParentsQueryKey(filter),
    queryData: ({ pageParam }) => ({
      query: {
        limit: PAGE_SIZE,
        ...(filter.company ? { company: filter.company } : {}),
        ...(filter.project ? { project: filter.project } : {}),
        ...(filter.department ? { department: filter.department } : {}),
        ...(filter.state ? { state: filter.state } : {}),
        ...(filter.source ? { source: filter.source } : {}),
        ...(pageParam ? { before: pageParam } : {}),
      },
    }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage: TaskParentsPageResponse) => lastPage.body.nextCursor ?? undefined,
    select: selectTaskParents,
  });
}
