import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getCategoriesQueryKey } from "../queries/useCategoriesQuery";

/** Create a category (`POST /api/agents/categories`); refreshes the taxonomy on success. */
export const useCreateCategoryMutation = makeInvalidatingMutation(
  apiClient.categories.createCategory.useMutation,
  getCategoriesQueryKey,
);
