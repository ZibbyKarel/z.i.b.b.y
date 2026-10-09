import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamKbIngestQueryKey(teamId: string) {
  return ["teams", teamId, "kb", "ingest"] as const;
}

/** A team KB's ingest status (`GET /api/teams/:id/kb/ingest`). `teamId: null` keeps it inert. */
export function useTeamKbIngestQuery(teamId: string | null) {
  return apiClient.teams.getTeamKbIngest.useQuery({
    queryKey: getTeamKbIngestQueryKey(teamId ?? ""),
    queryData: { params: { id: teamId ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== null,
  });
}
