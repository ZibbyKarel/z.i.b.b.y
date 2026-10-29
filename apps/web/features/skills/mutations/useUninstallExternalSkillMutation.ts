import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getWorkflowsQueryKey } from "../../workflows";
import { getExternalSkillUsagesQueryKey } from "../queries/useExternalSkillUsagesQuery";
import { getSkillQueryKey } from "../queries/useSkillQuery";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/**
 * Uninstall an external skill (`POST /api/skills/external/:id/uninstall`), deleting
 * or editing the workflows that use it. Drops the gone skill's single + usages
 * cache (a refetch would just 404 on the still-mounted detail page), then
 * refreshes the skill list and workflows; the dialog renders 409/422 inline.
 */
export function useUninstallExternalSkillMutation() {
  const qc = useQueryClient();
  return apiClient.externalSkills.uninstallExternalSkill.useMutation({
    meta: { inlineError: true },
    onSuccess: (_data, { params: { id } }) => {
      qc.removeQueries({ queryKey: getSkillQueryKey(id), exact: true });
      qc.removeQueries({ queryKey: getExternalSkillUsagesQueryKey(id), exact: true });
      void qc.invalidateQueries({ queryKey: getSkillsQueryKey(), exact: true });
      void qc.invalidateQueries({ queryKey: getWorkflowsQueryKey() });
    },
  });
}
