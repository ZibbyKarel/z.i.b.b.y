import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/**
 * Delete a project (`DELETE /api/projects/:id`). Removes only the registry record;
 * the files it points at on disk are untouched. Refreshes the registry on success.
 */
export function useDeleteProjectMutation() {
  const qc = useQueryClient();
  return apiClient.projects.deleteProject.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectsQueryKey() }),
  });
}
