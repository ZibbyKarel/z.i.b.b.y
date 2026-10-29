import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the operator-channel settings. Exported so mutations can invalidate it. */
export function getOperatorChannelSettingsQueryKey() {
  return ["operator-channel-settings"] as const;
}

/** The operator-channel settings from `GET /api/operator-channel/settings` (defaults when absent). */
export function useOperatorChannelSettingsQuery() {
  return apiClient.operatorChannel.getOperatorChannelSettings.useQuery({
    queryKey: getOperatorChannelSettingsQueryKey(),
    select: selectApiResponseBody,
  });
}
