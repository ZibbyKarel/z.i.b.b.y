import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../../state/api";
import { getCategoriesQueryKey } from "../queries/useCategoriesQuery";

/** Create a category (`POST /api/agents/categories`); refreshes the taxonomy on success. */
export function useCreateCategoryMutation() {
  const qc = useQueryClient();
  return apiClient.categories.createCategory.useMutation({
    onSuccess: () => qc.invalidateQueries({ queryKey: getCategoriesQueryKey() }),
  });
}
