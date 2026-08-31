import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getTeamsQueryKey } from "../queries/useTeamsQuery";

/** Create a team (`POST /api/teams`); refreshes the registry on success. */
export const useCreateTeamMutation = makeInvalidatingMutation(
  apiClient.teams.createTeam.useMutation,
  getTeamsQueryKey,
);
