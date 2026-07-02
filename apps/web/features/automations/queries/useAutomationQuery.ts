import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one automation's detail. Prefix-nested under the
 * `["automations"]` list family, so the mutations' existing list invalidation
 * refreshes the detail too.
 */
export function getAutomationQueryKey(id: string) {
  return ["automations", "detail", id] as const;
}

/** One automation from `GET /api/automations/:id` — backs the `/automations/:id` detail page. */
export function useAutomationQuery(id: string) {
  return apiClient.automations.getAutomation.useQuery({
    queryKey: getAutomationQueryKey(id),
    queryData: { params: { id } },
    retry: false,
    select: selectApiResponseBody,
  });
}
