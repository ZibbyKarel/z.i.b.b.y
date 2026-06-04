import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the skill taxonomy; exported so mutations can invalidate it. */
export function getSkillCategoriesQueryKey() {
  return ["skill-categories"] as const;
}

/**
 * Live skill taxonomy from `GET /api/skills/categories`. Returns the TanStack
 * query result directly; `select` unwraps the envelope so `data` is `Category[]`.
 * Kept on its own cache key (distinct from the agent and project taxonomies) since
 * each catalog manages an independent list of categories.
 */
export function useSkillCategoriesQuery() {
  return apiClient.skillCategories.listCategories.useQuery({
    queryKey: getSkillCategoriesQueryKey(),
    select: selectApiResponseBody,
  });
}
