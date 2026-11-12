import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/**
 * Cache key for one automation's fire history. Prefix-nested under the
 * `["automations"]` list family, so a list invalidation refreshes it too.
 */
export function getAutomationFiresQueryKey(id: string) {
  return ["automations", id, "fires"] as const;
}

/**
 * Fire history of one automation, newest first (`GET /api/automations/:id/fires`).
 * Kept live by the `automation-fires` events scope — no polling. Idle without an id.
 */
export function useAutomationFiresQuery(id: string | undefined) {
  return apiClient.automations.listAutomationFires.useQuery({
    queryKey: getAutomationFiresQueryKey(id ?? ""),
    queryData: { params: { id: id ?? "" } },
    enabled: Boolean(id),
    retry: false,
    select: selectApiResponseBody,
  });
}
