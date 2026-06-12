import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the assembled briefing. Exported so the SSE bridge can invalidate it. */
export function getBriefingQueryKey() {
  return ["briefing", "current"] as const;
}

/**
 * The current briefing from `GET /api/briefing` — a PURE assembly, no side effects,
 * so the overview card can read it freely. The SSE `activity` scope invalidates this
 * key when a `briefing-generated` entry lands (and the generate mutation does too).
 */
export function useBriefingQuery() {
  return apiClient.briefing.getBriefing.useQuery({
    queryKey: getBriefingQueryKey(),
    select: selectApiResponseBody,
  });
}
