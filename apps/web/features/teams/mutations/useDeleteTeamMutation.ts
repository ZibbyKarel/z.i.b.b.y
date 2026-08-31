import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getTeamsQueryKey } from "../queries/useTeamsQuery";

/**
 * Delete a team (`DELETE /api/teams/:id`). Linked projects keep their now-dangling
 * `teamId` — the API allows this (no cascade) and a dangling id resolves to "no
 * team" at read time, mirroring the company/project decision. Refreshes the
 * registry on success.
 */
export const useDeleteTeamMutation = makeInvalidatingMutation(
  apiClient.teams.deleteTeam.useMutation,
  getTeamsQueryKey,
);
