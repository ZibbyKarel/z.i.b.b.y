import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the operator research config. Exported so mutations can invalidate it. */
export function getResearchConfigQueryKey() {
  return ["research", "config"] as const;
}

/** The operator research/intelligence config from `GET /api/research/config`. */
export function useResearchConfigQuery() {
  return apiClient.research.getConfig.useQuery({
    queryKey: getResearchConfigQueryKey(),
    select: selectApiResponseBody,
  });
}
