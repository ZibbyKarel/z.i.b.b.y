import { apiClient } from "../../../state/api";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";

/** Cache key for the `speakd` voice catalog. */
export function getSpeechVoicesQueryKey() {
  return ["speech", "voices"] as const;
}

/**
 * The voices `speakd` currently has available (`GET /api/speech/voices`), for the
 * `/settings` voice picker (Phase 119c). Errors (503 — daemon down) surface as the
 * usual TanStack Query error state; the picker's caller renders the section's
 * inline degraded note instead of a broken control rather than handling it here.
 */
export function useSpeechVoicesQuery() {
  return apiClient.speech.listVoices.useQuery({
    queryKey: getSpeechVoicesQueryKey(),
    select: selectApiResponseBody,
  });
}
