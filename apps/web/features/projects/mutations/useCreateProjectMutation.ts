import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Create a project (`POST /api/projects`); refreshes the registry on success. */
export function useCreateProjectMutation() {
  const qc = useQueryClient();
  return apiClient.projects.createProject.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectsQueryKey() }),
  });
}
