import { apiClient } from "../../../state/api";

/**
 * Close a streaming dictation session and get the full transcript
 * (`POST /api/speech/dictation/:id/finish`). Failures fall back to a one-shot
 * transcription in `useDictationRecorder`, so the toast stays quiet.
 */
export function useFinishDictationMutation() {
  return apiClient.speech.finishDictation.useMutation({ meta: { inlineError: true } });
}
