import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the `speakd` daemon status. */
export function getSpeechStatusQueryKey() {
  return ["speech", "status"] as const;
}

/**
 * The `speakd` daemon's own status (`GET /api/speech/status`), for the compact
 * status line on the `/settings` voice picker (Phase 119c). The endpoint always
 * answers `200` — `reachable: false` (plus degraded placeholders elsewhere in the
 * body) is how a down daemon is reported, so this query never errors on that
 * account; render the degraded state straight from the body, no error handling
 * needed at the call site.
 */
export function useSpeechStatusQuery() {
  return apiClient.speech.getStatus.useQuery({
    queryKey: getSpeechStatusQueryKey(),
    select: selectApiResponseBody,
  });
}
