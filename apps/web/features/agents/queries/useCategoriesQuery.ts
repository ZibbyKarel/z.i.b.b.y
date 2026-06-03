import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Shared cache key for the category taxonomy. Exported so mutations can target it
 * for invalidation.
 */
export function getCategoriesQueryKey() {
  return ["categories"] as const;
}

/**
 * Live category taxonomy from `GET /api/agents/categories`. Returns the TanStack
 * query result directly; `select` unwraps the envelope so `data` is `Category[]`.
 * Backed by the shared `["categories"]` cache so the agents screen and the agent
 * editor read one source.
 */
export function useCategoriesQuery() {
  return apiClient.categories.listCategories.useQuery({
    queryKey: getCategoriesQueryKey(),
    select: selectApiResponseBody,
  });
}
