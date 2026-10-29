import { useQueryClient } from "@tanstack/react-query";
import { getTeamKbQueryKeyPrefix } from "../queries";
import { apiClient } from "../../../state/api";

/**
 * Resolve an open KB question (`POST /api/teams/:id/kb/questions/resolve`); refreshes everything
 * under the team's KB (digest, notes, graph) since the answer note changes all three.
 */
export function useResolveTeamKbQuestionMutation(teamId: string) {
  const queryClient = useQueryClient();
  return apiClient.teams.resolveTeamKbQuestion.useMutation({
    // onSettled: a 404/409 means the widget row is stale, so refresh on errors too.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getTeamKbQueryKeyPrefix(teamId) });
    },
  });
}
