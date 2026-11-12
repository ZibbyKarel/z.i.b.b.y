import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

const USAGE_POLL_MS = 3 * 60 * 1000; // 3m, same calm cadence as the limits query
/** The usage window the dashboard shows. */
export const AI_USAGE_DAYS = 30;

/** Cache key for opencode usage over the last `days` days. */
export function getAiUsageQueryKey(days: number = AI_USAGE_DAYS) {
  return ["ai-providers", "usage", days] as const;
}

/** opencode's recorded usage per `provider/model`, from `GET /api/ai-providers/usage`. Polls. */
export function useAiUsageQuery(days: number = AI_USAGE_DAYS) {
  return apiClient.aiProviders.getAiProvidersUsage.useQuery({
    queryKey: getAiUsageQueryKey(days),
    queryData: { query: { days } },
    refetchInterval: USAGE_POLL_MS,
    refetchIntervalInBackground: true,
    retry: false,
    select: selectApiResponseBody,
  });
}
