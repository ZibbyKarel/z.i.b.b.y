import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectProfileQueryKey } from "../queries/useProjectProfileQuery";
import { getProjectQueryKey } from "../queries/useProjectQuery";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/** Update a project's operational profile (`PUT /api/projects/:id/profile`). */
export function useUpdateProjectProfileMutation(id: string) {
  const qc = useQueryClient();
  return apiClient.projects.updateProjectProfile.useMutation({
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getProjectProfileQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getProjectQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getProjectsQueryKey() });
    },
  });
}
