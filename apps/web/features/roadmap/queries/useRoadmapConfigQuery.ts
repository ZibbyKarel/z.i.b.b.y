import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for one project's roadmap config (the automation toggles). */
export function getRoadmapConfigQueryKey(projectId: string) {
  return ["roadmap", "config", projectId] as const;
}

/**
 * A project's roadmap config (`GET /api/projects/:projectId/roadmap/config`) —
 * the automation toggles. `select` unwraps the `{ status, body }` envelope so `data` is the
 * `RoadmapConfig` directly.
 */
export function useRoadmapConfigQuery(projectId: string) {
  return apiClient.roadmap.getRoadmapConfig.useQuery({
    queryKey: getRoadmapConfigQueryKey(projectId),
    queryData: { params: { projectId } },
    select: selectApiResponseBody,
  });
}
