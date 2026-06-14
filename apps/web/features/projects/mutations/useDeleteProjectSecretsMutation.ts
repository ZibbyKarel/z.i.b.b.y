import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Remove a project's stored run secrets (`DELETE /api/projects/:id/secrets`). */
export function useDeleteProjectSecretsMutation() {
  const qc = useQueryClient();
  return apiClient.projects.deleteProjectSecrets.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectsQueryKey() }),
  });
}
