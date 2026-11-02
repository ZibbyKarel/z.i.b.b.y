import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the per-provider spend; under the status key, so a key change refetches it too. */
export function getAiProvidersSpendQueryKey() {
  return ["ai-providers", "spend"] as const;
}

/** ZIBBY's own spend through each provider's API this month, from `GET /api/ai-providers/spend`. */
export function useAiProvidersSpendQuery() {
  return apiClient.aiProviders.getAiProvidersSpend.useQuery({
    queryKey: getAiProvidersSpendQueryKey(),
    select: selectApiResponseBody,
  });
}
