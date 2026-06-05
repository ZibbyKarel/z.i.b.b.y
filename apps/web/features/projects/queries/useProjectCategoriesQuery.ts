import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Shared cache key for the project taxonomy; exported so mutations can invalidate it. */
export function getProjectCategoriesQueryKey() {
  return ["project-categories"] as const;
}

/**
 * Live project taxonomy from `GET /api/projects/categories`. Returns the TanStack
 * query result directly; `select` unwraps the envelope so `data` is `Category[]`.
 * Kept on its own cache key (distinct from the agent and skill taxonomies) since
 * each catalog manages an independent list of categories.
 */
export function useProjectCategoriesQuery() {
  return apiClient.projectCategories.listCategories.useQuery({
    queryKey: getProjectCategoriesQueryKey(),
    select: selectApiResponseBody,
  });
}
