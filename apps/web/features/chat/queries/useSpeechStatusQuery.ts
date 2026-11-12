import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the speech daemon / local STT status. */
export function getSpeechStatusQueryKey() {
  return ["speech", "status"] as const;
}

/** TTS daemon reachability + local STT readiness (`GET /api/speech/status`, always 200). */
export function useSpeechStatusQuery() {
  return apiClient.speech.getStatus.useQuery({
    queryKey: getSpeechStatusQueryKey(),
    select: selectApiResponseBody,
  });
}
