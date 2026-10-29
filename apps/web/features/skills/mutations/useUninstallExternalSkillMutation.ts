import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getWorkflowsQueryKey } from "../../workflows";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/**
 * Uninstall an external skill (`POST /api/skills/external/:id/uninstall`), deleting
 * or editing the workflows that use it. Refreshes skills (list + single, shared
 * prefix) and workflows; the dialog renders 409/422 inline.
 */
export function useUninstallExternalSkillMutation() {
  const qc = useQueryClient();
  return apiClient.externalSkills.uninstallExternalSkill.useMutation({
    meta: { inlineError: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: getSkillsQueryKey() });
      void qc.invalidateQueries({ queryKey: getWorkflowsQueryKey() });
    },
  });
}
