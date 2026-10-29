import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the operator-channel status. Exported so mutations can invalidate it. */
export function getOperatorChannelStatusQueryKey() {
  return ["operator-channel-status"] as const;
}

/** Connection, DM resolution and last delivery from `GET /api/operator-channel/status`. */
export function useOperatorChannelStatusQuery() {
  return apiClient.operatorChannel.getOperatorChannelStatus.useQuery({
    queryKey: getOperatorChannelStatusQueryKey(),
    select: selectApiResponseBody,
  });
}
