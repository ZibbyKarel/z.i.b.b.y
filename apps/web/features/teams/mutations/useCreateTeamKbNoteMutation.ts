import { useQueryClient } from "@tanstack/react-query";
import { getTeamKbQueryKeyPrefix } from "../queries";
import { apiClient } from "../../../state/api";

/** Create a note in a team's knowledge base (`POST /api/teams/:id/kb/notes`); refreshes the team's KB views. */
export function useCreateTeamKbNoteMutation() {
  const queryClient = useQueryClient();
  return apiClient.teams.createTeamKbNote.useMutation({
    onSuccess: (_data, { params }) => {
      void queryClient.invalidateQueries({ queryKey: getTeamKbQueryKeyPrefix(params.id) });
    },
  });
}
