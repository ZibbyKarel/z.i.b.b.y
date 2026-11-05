import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getInboxPrsQueryKey } from "../../inbox/queries";
import { getTeamsQueryKey } from "../queries/useTeamsQuery";

/** Partially update a team (`PATCH /api/teams/:id`); refreshes the registry and the inbox PRs (a slug changes what is searched). */
export function useUpdateTeamMutation() {
  const queryClient = useQueryClient();
  return apiClient.teams.updateTeam.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getTeamsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getInboxPrsQueryKey() });
    },
  });
}
