import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

export function getAutomationsQueryKey() {
  return ["automations"] as const;
}

/** Live automation list (`GET /api/automations`). */
export function useAutomationsQuery() {
  return apiClient.automations.listAutomations.useQuery({
    queryKey: getAutomationsQueryKey(),
    select: selectApiResponseBody,
  });
}
