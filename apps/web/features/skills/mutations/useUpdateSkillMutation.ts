import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillsQueryKey } from "../queries/useSkillsQuery";
import { getSkillQueryKey } from "../queries/useSkillQuery";

/** Update a skill (`PATCH /api/skills/:id`); refreshes the list + the single skill. */
export function useUpdateSkillMutation() {
  const qc = useQueryClient();
  return apiClient.skills.updateSkill.useMutation({
    onSuccess: (_data, { params: { id } }) => {
      qc.invalidateQueries({ queryKey: getSkillsQueryKey() });
      qc.invalidateQueries({ queryKey: getSkillQueryKey(id) });
    },
  });
}
