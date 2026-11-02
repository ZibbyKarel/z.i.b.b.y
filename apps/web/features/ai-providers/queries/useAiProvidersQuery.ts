import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the AI providers status. Exported so mutations can invalidate it. */
export function getAiProvidersQueryKey() {
  return ["ai-providers"] as const;
}

/** Which AI providers have a key configured, from `GET /api/ai-providers`. */
export function useAiProvidersQuery() {
  return apiClient.aiProviders.getAiProviders.useQuery({
    queryKey: getAiProvidersQueryKey(),
    select: selectApiResponseBody,
  });
}
