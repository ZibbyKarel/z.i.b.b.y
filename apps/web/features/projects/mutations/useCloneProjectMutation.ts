import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectLocalStateQueryKey } from "../queries/useProjectLocalStateQuery";
import { getProjectsQueryKey } from "../queries/useProjectsQuery";

/**
 * Clone a project into THIS machine's cloneRoot (`POST /api/projects/:id/clone`,
 * Phase 76) — 422 when the project has no `gitRemote`, 409 when this machine
 * already has it present. Refreshes the project's local-state readout (so the
 * missing-clone banner disappears on success) and the registry list.
 */
export function useCloneProjectMutation() {
  const qc = useQueryClient();
  return apiClient.projects.cloneProject.useMutation({
    onSuccess: (_data, { params: { id } }) => {
      void qc.invalidateQueries({ queryKey: getProjectLocalStateQueryKey(id) });
      void qc.invalidateQueries({ queryKey: getProjectsQueryKey() });
    },
  });
}
