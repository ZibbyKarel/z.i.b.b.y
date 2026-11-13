import { apiClient } from "../../../state/api";

/**
 * Open a streaming dictation session (`POST /api/speech/dictation`). Failures are
 * handled by `useDictationRecorder` (it falls back to a one-shot transcription), so
 * the global mutation toast stays quiet via `meta.inlineError`.
 */
export function useStartDictationMutation() {
  return apiClient.speech.startDictation.useMutation({ meta: { inlineError: true } });
}
