import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the project registry — the TanStack cache is the FE source
 * of truth. Exported so mutations can target it for invalidation.
 */
export function getProjectsQueryKey() {
  return ["projects"] as const;
}

/**
 * Live project registry from `GET /api/projects` — the contract `Project` entity
 * is the single shape used end to end. Returns the TanStack query result directly;
 * `select` unwraps the response envelope so `data` is `Project[]`. Backed by the
 * shared `["projects"]` cache, so every screen that reads projects (the projects
 * page, the New Task composer) shares one source.
 */
export function useProjectsQuery() {
  return apiClient.projects.listProjects.useQuery({
    queryKey: getProjectsQueryKey(),
    select: selectApiResponseBody,
  });
}
