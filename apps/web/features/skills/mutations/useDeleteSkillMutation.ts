import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Delete a skill (`DELETE /api/skills/:id`); refreshes the skill list on success. */
export function useDeleteSkillMutation() {
  const qc = useQueryClient();
  return apiClient.skills.deleteSkill.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getSkillsQueryKey() }),
  });
}
