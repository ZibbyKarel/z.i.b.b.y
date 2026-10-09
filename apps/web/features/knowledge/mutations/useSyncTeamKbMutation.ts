import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getTeamKbGraphQueryKey } from "../queries/useTeamKbGraphQuery";
import { getTeamKbIngestQueryKey } from "../queries/useTeamKbIngestQuery";
import { getTeamKbNotesQueryKey } from "../queries/useTeamKbNotesQuery";

/**
 * Fast-forward a team's KB clone (`POST /api/teams/:id/kb/sync`). Invalidates
 * that team's KB graph, note list, open notes and ingest log so pulled changes show up.
 */
export function useSyncTeamKbMutation() {
  const qc = useQueryClient();
  return apiClient.teams.syncTeamKb.useMutation({
    onSuccess: (_data, variables) => {
      const id = variables.params.id;
      void qc.invalidateQueries({ queryKey: getTeamKbGraphQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getTeamKbNotesQueryKey(id) });
      void qc.invalidateQueries({ queryKey: ["teams", id, "kb", "note"] });
      void qc.invalidateQueries({ queryKey: getTeamKbIngestQueryKey(id) });
    },
  });
}
