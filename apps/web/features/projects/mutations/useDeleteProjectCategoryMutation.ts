import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectCategoriesQueryKey } from "../queries/useProjectCategoriesQuery";

/**
 * Delete a project category (`DELETE /api/projects/categories/:name`). The API
 * refuses (409) while any project still references it, so only empty categories
 * are removable; refreshes the taxonomy on success.
 */
export const useDeleteProjectCategoryMutation = makeInvalidatingMutation(
  apiClient.projectCategories.deleteCategory.useMutation,
  getProjectCategoriesQueryKey,
);
