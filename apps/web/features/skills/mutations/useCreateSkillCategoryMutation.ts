import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillCategoriesQueryKey } from "../queries/useSkillCategoriesQuery";

/** Create a skill category (`POST /api/skills/categories`); refreshes the taxonomy. */
export function useCreateSkillCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.skillCategories.createCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getSkillCategoriesQueryKey() }),
  });
}
