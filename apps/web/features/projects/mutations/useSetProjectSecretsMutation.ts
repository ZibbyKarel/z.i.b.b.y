import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/**
 * Set a project's run secrets (`PUT /api/projects/:id/secrets`). Write-only — the
 * secret values are never read back; the registry is refreshed so `hasSecrets`
 * flips to true.
 */
export const useSetProjectSecretsMutation = makeInvalidatingMutation(
  apiClient.projects.setProjectSecrets.useMutation,
  getProjectsQueryKey,
);
