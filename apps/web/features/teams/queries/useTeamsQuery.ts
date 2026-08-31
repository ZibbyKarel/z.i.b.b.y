import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the team registry — the TanStack cache is the FE source
 * of truth. Exported so mutations can target it for invalidation.
 */
export function getTeamsQueryKey() {
  return ["teams"] as const;
}

/**
 * Live team registry from `GET /api/teams` — the contract `Team` entity is the
 * single shape used end to end. Returns the TanStack query result directly;
 * `select` unwraps the response envelope so `data` is `Team[]`.
 */
export function useTeamsQuery() {
  return apiClient.teams.listTeams.useQuery({
    queryKey: getTeamsQueryKey(),
    select: selectApiResponseBody,
  });
}
