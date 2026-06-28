import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getProjectCategoriesQueryKey } from "../queries/useProjectCategoriesQuery";

/** Create a project category (`POST /api/projects/categories`); refreshes the taxonomy. */
export const useCreateProjectCategoryMutation = makeInvalidatingMutation(
  apiClient.projectCategories.createCategory.useMutation,
  getProjectCategoriesQueryKey,
);
