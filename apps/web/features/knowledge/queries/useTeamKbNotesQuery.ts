import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamKbNotesQueryKey(teamId: string) {
  return ["teams", teamId, "kb", "notes"] as const;
}

/** A team KB's markdown note list (`GET /api/teams/:id/kb/notes`). `teamId: null` keeps it inert. */
export function useTeamKbNotesQuery(teamId: string | null) {
  return apiClient.teams.listTeamKbNotes.useQuery({
    queryKey: getTeamKbNotesQueryKey(teamId ?? ""),
    queryData: { params: { id: teamId ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== null,
  });
}
