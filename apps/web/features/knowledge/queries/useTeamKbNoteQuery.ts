import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getTeamKbNoteQueryKey(teamId: string, path: string) {
  return ["teams", teamId, "kb", "note", path] as const;
}

/** One team KB note by repo-relative path (`GET /api/teams/:id/kb/note`); inert without both args. */
export function useTeamKbNoteQuery(teamId: string | null, path: string | null) {
  return apiClient.teams.getTeamKbNote.useQuery({
    queryKey: getTeamKbNoteQueryKey(teamId ?? "", path ?? ""),
    queryData: { params: { id: teamId ?? "" }, query: { path: path ?? "" } },
    select: selectApiResponseBody,
    enabled: teamId !== null && path !== null,
  });
}
