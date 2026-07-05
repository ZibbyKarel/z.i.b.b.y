import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the pinned targets. Exported so mutations can invalidate it. */
export function getPinsQueryKey() {
  return ["pins"] as const;
}

/** The operator-owned pinned targets from `GET /api/pins`. */
export function usePinsQuery() {
  return apiClient.pins.getPins.useQuery({
    queryKey: getPinsQueryKey(),
    select: selectApiResponseBody,
  });
}
