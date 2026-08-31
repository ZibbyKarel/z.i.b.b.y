import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getTeamsQueryKey } from "../queries/useTeamsQuery";

/** Partially update a team (`PATCH /api/teams/:id`); refreshes the registry. */
export const useUpdateTeamMutation = makeInvalidatingMutation(
  apiClient.teams.updateTeam.useMutation,
  getTeamsQueryKey,
);
