import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectCiQueryKey } from "../queries/useProjectCiQuery";

/**
 * "Opravit CI" on a red base branch (`POST /api/project-ci/:projectId/fix`): the API creates a
 * task whose output is a PR — ZIBBY opens it itself (Tier-2), the operator merges. Always an
 * explicit operator click. Success refetches the project's CI, which then carries `fixTaskId`
 * (the button shows the fix running).
 */
export function useFixProjectCiMutation() {
  const qc = useQueryClient();
  return apiClient.projectCi.fixProjectCi.useMutation({
    onSuccess: (_data, { params: { projectId } }) => {
      void qc.invalidateQueries({ queryKey: getProjectCiQueryKey(projectId) });
    },
  });
}
