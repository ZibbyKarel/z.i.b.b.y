import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/**
 * Check one external skill for upstream changes (`POST /api/skills/external/:id/sync`).
 * Invalidates on settle, not success: a 502 still records `lastError` on the skill.
 * `["skills"]` is a prefix of the single-skill key, so both refresh.
 */
export function useSyncExternalSkillMutation() {
  const qc = useQueryClient();
  return apiClient.externalSkills.syncExternalSkill.useMutation({
    onSettled: () => void qc.invalidateQueries({ queryKey: getSkillsQueryKey() }),
  });
}
