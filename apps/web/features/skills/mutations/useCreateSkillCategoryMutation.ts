import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getSkillCategoriesQueryKey } from "../queries/useSkillCategoriesQuery";

/** Create a skill category (`POST /api/skills/categories`); refreshes the taxonomy. */
export const useCreateSkillCategoryMutation = makeInvalidatingMutation(
  apiClient.skillCategories.createCategory.useMutation,
  getSkillCategoriesQueryKey,
);
