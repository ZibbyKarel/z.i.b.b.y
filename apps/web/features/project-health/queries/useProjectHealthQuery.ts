import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** State polling — the health/limits family. SSE (`runEvents`) makes transitions instant. */
const PROJECT_HEALTH_POLL_MS = 60_000;

/** Shared cache key for every project's last-known health status. */
export function getProjectHealthQueryKey() {
  return ["project-health"] as const;
}

/**
 * `GET /api/project-health` — one status per project that has a health check and
 * has been checked at least once. Health is STATE (N4b precedent): the watcher
 * overwrites it each check, so a slow interval covers the silent recovery while
 * `runEvents` invalidates this key on the two `project-health-*` activity kinds.
 * Returns the query result directly; `data` is the `ProjectHealthStatus[]` body.
 */
export function useProjectHealthQuery() {
  return apiClient.projectHealth.listProjectHealth.useQuery({
    queryKey: getProjectHealthQueryKey(),
    refetchInterval: PROJECT_HEALTH_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
