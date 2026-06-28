import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCategoriesQueryKey } from "../queries/useCategoriesQuery";

/**
 * Delete a category (`DELETE /api/agents/categories/:name`). The API refuses
 * (409) while any agent still references it, so only empty categories are
 * removable; refreshes the taxonomy on success.
 */
export const useDeleteCategoryMutation = makeInvalidatingMutation(
  apiClient.categories.deleteCategory.useMutation,
  getCategoriesQueryKey,
);
