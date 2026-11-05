import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../../inbox/queries";
import { getTeamsQueryKey } from "../queries/useTeamsQuery";

/** Create a team (`POST /api/teams`); refreshes the registry and the inbox PRs (a slug changes what is searched). */
export function useCreateTeamMutation() {
  const queryClient = useQueryClient();
  return apiClient.teams.createTeam.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getTeamsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
