import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one integration's detail. Prefix-nested under the
 * `["integrations"]` list family, so the mutations' existing list invalidation
 * refreshes the detail too.
 */
export function getIntegrationQueryKey(id: string) {
  return ["integrations", "detail", id] as const;
}

/** One integration from `GET /api/integrations/:id` — backs the nested detail page. */
export function useIntegrationQuery(id: string) {
  return apiClient.integrations.getIntegration.useQuery({
    queryKey: getIntegrationQueryKey(id),
    queryData: { params: { id } },
    retry: false,
    select: selectApiResponseBody,
  });
}
