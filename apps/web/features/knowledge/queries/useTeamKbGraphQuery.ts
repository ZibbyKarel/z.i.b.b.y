import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamKbGraphQueryKey(teamId: string) {
  return ["teams", teamId, "kb", "graph"] as const;
}

/** A team's read-only knowledge-base graph (`GET /api/teams/:id/kb/graph`). `teamId: null` keeps it inert. */
export function useTeamKbGraphQuery(teamId: string | null) {
  return apiClient.teams.getTeamKbGraph.useQuery({
    queryKey: getTeamKbGraphQueryKey(teamId ?? ""),
    queryData: { params: { id: teamId ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== null,
  });
}
