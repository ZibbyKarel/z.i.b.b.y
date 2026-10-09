import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getTeamKbGraphQueryKey } from "../queries/useTeamKbGraphQuery";

/**
 * Fast-forward a team's KB clone (`POST /api/teams/:id/kb/sync`). Invalidates
 * that team's KB graph so newly pulled notes show up after refetch.
 */
export function useSyncTeamKbMutation() {
  const qc = useQueryClient();
  return apiClient.teams.syncTeamKb.useMutation({
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: getTeamKbGraphQueryKey(variables.params.id) }),
  });
}
