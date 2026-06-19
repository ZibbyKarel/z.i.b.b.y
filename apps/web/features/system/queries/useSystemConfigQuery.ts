import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the runtime system config. Exported so mutations can invalidate it. */
export function getSystemConfigQueryKey() {
  return ["system", "config"] as const;
}

/** The operator-owned runtime system config from `GET /api/system/config`. */
export function useSystemConfigQuery() {
  return apiClient.system.getConfig.useQuery({
    queryKey: getSystemConfigQueryKey(),
    select: selectApiResponseBody,
  });
}
