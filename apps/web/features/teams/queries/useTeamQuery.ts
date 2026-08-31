import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamQueryKey(id: string) {
  return ["teams", id] as const;
}

/** Single team by id (`GET /api/teams/:id`). Pass `{ enabled: false }` to keep
 * the hook inert (e.g. the "new team" detail screen, which has no id yet). */
export function useTeamQuery(id: string, options?: { enabled?: boolean }) {
  return apiClient.teams.getTeam.useQuery({
    queryKey: getTeamQueryKey(id),
    queryData: { params: { id } },
    select: selectApiResponseBody,
    enabled: options?.enabled,
  });
}
