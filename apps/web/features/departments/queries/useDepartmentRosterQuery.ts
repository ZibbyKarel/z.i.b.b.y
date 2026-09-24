import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single department's stored roster. */
export function getDepartmentRosterQueryKey(id: string) {
  return ["departments", id, "roster"] as const;
}

/**
 * NS2 F1c — reads `GET /api/departments/:id/roster`: the department's owned
 * agents, integrations, and CI monitors, read directly off `department`
 * tags (replaces the old client-side `deriveCrew`). Returns the TanStack
 * query result directly; `select` unwraps the ts-rest envelope so `data` is
 * the `DepartmentRoster` body.
 */
export function useDepartmentRosterQuery(id: string) {
  return apiClient.departments.getRoster.useQuery({
    queryKey: getDepartmentRosterQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
