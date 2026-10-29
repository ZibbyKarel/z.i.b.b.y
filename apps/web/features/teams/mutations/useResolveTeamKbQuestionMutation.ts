import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";

/**
 * Resolve an open KB question (`POST /api/teams/:id/kb/questions/resolve`); refreshes everything
 * under the team's KB (digest, notes, graph) since the answer note changes all three.
 */
export function useResolveTeamKbQuestionMutation(teamId: string) {
  const queryClient = useQueryClient();
  return apiClient.teams.resolveTeamKbQuestion.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teams", teamId, "kb"] });
    },
  });
}
