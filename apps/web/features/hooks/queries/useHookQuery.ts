import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one hook's detail. Prefix-nested under the `["hooks"]` list
 * family, so the mutations' existing list invalidation refreshes the detail too.
 */
export function getHookQueryKey(id: string) {
  return ["hooks", "detail", id] as const;
}

/** One hook from `GET /api/hooks/:id` — backs the `/hooks/:id` detail page. */
export function useHookQuery(id: string) {
  return apiClient.hooks.getHook.useQuery({
    queryKey: getHookQueryKey(id),
    queryData: { params: { id } },
    retry: false,
    select: selectApiResponseBody,
  });
}
