import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for one project's roadmap items. */
export function getRoadmapItemsQueryKey(projectId: string) {
  return ["roadmap", "items", projectId] as const;
}

/**
 * A project's roadmap items — epics + tasks (`GET
 * /api/projects/:projectId/roadmap`). `select` unwraps the `{ status, body }`
 * envelope so `data` is the `RoadmapItem[]` directly; call sites default it to
 * `[]`. Read-only in this sub-phase (125d) — nothing here mutates an item.
 */
export function useRoadmapItemsQuery(projectId: string, options?: { enabled?: boolean }) {
  return apiClient.roadmap.listRoadmapItems.useQuery({
    queryKey: getRoadmapItemsQueryKey(projectId),
    queryData: { params: { projectId } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
