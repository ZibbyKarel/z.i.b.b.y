import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for a single subsystem's stored roster. */
export function getSubsystemRosterQueryKey(id: string) {
  return ["subsystems", id, "roster"] as const;
}

/**
 * NS2 F1c — reads `GET /api/subsystems/:id/roster`: the subsystem's owned
 * agents, integrations, and CI monitors, read directly off `ownerSubsystem`
 * tags (replaces the old client-side `deriveCrew`). Returns the TanStack
 * query result directly; `select` unwraps the ts-rest envelope so `data` is
 * the `SubsystemRoster` body.
 */
export function useSubsystemRosterQuery(id: string) {
  return apiClient.subsystems.getRoster.useQuery({
    queryKey: getSubsystemRosterQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
  });
}
