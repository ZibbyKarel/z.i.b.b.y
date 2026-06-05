import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectCategoriesQueryKey } from "../queries/useProjectCategoriesQuery";

/**
 * Delete a project category (`DELETE /api/projects/categories/:name`). The API
 * refuses (409) while any project still references it, so only empty categories
 * are removable; refreshes the taxonomy on success.
 */
export function useDeleteProjectCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.projectCategories.deleteCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectCategoriesQueryKey() }),
  });
}
