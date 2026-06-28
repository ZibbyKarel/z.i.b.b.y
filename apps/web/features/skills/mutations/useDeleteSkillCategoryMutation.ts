import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSkillCategoriesQueryKey } from "../queries/useSkillCategoriesQuery";

/**
 * Delete a skill category (`DELETE /api/skills/categories/:name`). The API refuses
 * (409) while any skill still references it, so only empty categories are
 * removable; refreshes the taxonomy on success.
 */
export const useDeleteSkillCategoryMutation = makeInvalidatingMutation(
  apiClient.skillCategories.deleteCategory.useMutation,
  getSkillCategoriesQueryKey,
);
