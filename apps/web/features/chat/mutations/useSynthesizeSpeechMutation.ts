import { apiClient } from "../../../state/api";

/**
 * Synthesize speech for a chat message (`POST /api/speech/synthesize`) via the
 * local `speakd` daemon proxy. Body is just `{ text }` — no `voice` override,
 * so the daemon's own default voice is used (Phase 120, minimal read-aloud; no
 * voice picker, no streaming). Returns the ts-rest mutation result directly;
 * the 200 body is `{ audioBase64, format: "wav", audioMs, synthMs, voice }`.
 *
 * A non-2xx response (400 bad text/voice, 409 daemon busy, 422 invalid input,
 * 503 daemon down/loading) throws — ts-rest's default for any status outside
 * 2xx — and is picked up by the app-wide `QueryClient` `MutationCache.onError`
 * → toast, exactly like every other mutation in the app. No bespoke error
 * handling at the call site.
 */
export function useSynthesizeSpeechMutation() {
  return apiClient.speech.synthesize.useMutation();
}
