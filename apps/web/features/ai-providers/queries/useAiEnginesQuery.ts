import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the run-engine availability. */
export function getAiEnginesQueryKey() {
  return ["ai-providers", "engines"] as const;
}

/** Which run engines (claude / opencode) are installed, from `GET /api/ai-providers/engines`. */
export function useAiEnginesQuery() {
  return apiClient.aiProviders.getAiEngines.useQuery({
    queryKey: getAiEnginesQueryKey(),
    select: selectApiResponseBody,
  });
}
