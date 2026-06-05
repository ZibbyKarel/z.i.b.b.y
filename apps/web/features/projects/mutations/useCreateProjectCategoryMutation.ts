import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getProjectCategoriesQueryKey } from "../queries/useProjectCategoriesQuery";

/** Create a project category (`POST /api/projects/categories`); refreshes the taxonomy. */
export function useCreateProjectCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.projectCategories.createCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getProjectCategoriesQueryKey() }),
  });
}
