import { apiClient } from "../../../state/api";

/**
 * Transcribe a recorded dictation clip (`POST /api/speech/transcribe`) with the
 * local Hex app. Errors (503 STT unavailable, 422 undecodable audio)
 * are surfaced by `useDictationRecorder` through the voice-mode toast, so the
 * global mutation toast stays quiet via `meta.inlineError`.
 */
export function useTranscribeSpeechMutation() {
  return apiClient.speech.transcribe.useMutation({ meta: { inlineError: true } });
}
