import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";

/** Create a skill (`POST /api/skills`); refreshes the skill list on success. */
export function useCreateSkillMutation() {
  const qc = useQueryClient();
  return apiClient.skills.createSkill.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getSkillsQueryKey() }),
  });
}
