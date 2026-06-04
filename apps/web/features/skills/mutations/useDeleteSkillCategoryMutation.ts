import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getSkillCategoriesQueryKey } from "../queries/useSkillCategoriesQuery";

/**
 * Delete a skill category (`DELETE /api/skills/categories/:name`). The API refuses
 * (409) while any skill still references it, so only empty categories are
 * removable; refreshes the taxonomy on success.
 */
export function useDeleteSkillCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.skillCategories.deleteCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getSkillCategoriesQueryKey() }),
  });
}
