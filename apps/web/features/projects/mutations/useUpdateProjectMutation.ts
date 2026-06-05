import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Partially update a project (`PATCH /api/projects/:id`); refreshes the registry. */
export function useUpdateProjectMutation() {
  const qc = useQueryClient();
  return apiClient.projects.updateProject.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectsQueryKey() }),
  });
}
