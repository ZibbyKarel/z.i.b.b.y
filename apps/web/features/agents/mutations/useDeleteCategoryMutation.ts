import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getCategoriesQueryKey } from "../queries/useCategoriesQuery";

/**
 * Delete a category (`DELETE /api/agents/categories/:name`). The API refuses
 * (409) while any agent still references it, so only empty categories are
 * removable; refreshes the taxonomy on success.
 */
export function useDeleteCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.categories.deleteCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getCategoriesQueryKey() }),
  });
}
