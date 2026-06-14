import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/**
 * Set a project's run secrets (`PUT /api/projects/:id/secrets`). Write-only — the
 * secret values are never read back; the registry is refreshed so `hasSecrets`
 * flips to true.
 */
export function useSetProjectSecretsMutation() {
  const qc = useQueryClient();
  return apiClient.projects.setProjectSecrets.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectsQueryKey() }),
  });
}
