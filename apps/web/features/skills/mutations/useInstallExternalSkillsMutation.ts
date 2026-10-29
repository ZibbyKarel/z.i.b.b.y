import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Install chosen repo folders as skills (`POST /api/skills/external`); errors render inline. */
export function useInstallExternalSkillsMutation() {
  const qc = useQueryClient();
  return apiClient.externalSkills.installExternalSkills.useMutation({
    meta: { inlineError: true },
    onSuccess: () => void qc.invalidateQueries({ queryKey: getSkillsQueryKey() }),
  });
}
