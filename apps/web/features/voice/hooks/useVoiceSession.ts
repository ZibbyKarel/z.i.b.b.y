"use client";

import type { VoiceState } from "../components/VoiceOrb";
import { useVoiceDemoSequence } from "./useVoiceDemoSequence";
import {
  type SpeechRecognitionError,
  useSpeechRecognition,
} from "./useSpeechRecognition";

export type VoiceMode = "live" | "demo";

/**
 * What the voice screen consumes — one shape over either a real recognition
 * session ({@link useSpeechRecognition}) or the scripted fallback
 * ({@link useVoiceDemoSequence}). The screen renders against this and never
 * knows which backed it.
 */
export interface VoiceSession {
  mode: VoiceMode;
  state: VoiceState;
  /** Any non-idle state. */
  isActive: boolean;
  /** Demo only: whether the scripted second half is revealed. */
  revealed: boolean;
  /** Live only: the last finalized spoken utterance. */
  transcript: string;
  /** Live only: in-progress ghost text. */
  interim: string;
  /** Whether live recognition is available in this browser. */
  isSupported: boolean;
  error: SpeechRecognitionError | null;
  /** Start/stop listening (live) or run/abort the scripted cycle (demo). */
  toggleMic: () => void;
}

export interface UseVoiceSessionOptions {
  /** Force a mode; defaults to `live` when supported, else `demo`. */
  mode?: VoiceMode;
  /** BCP-47 tag for live recognition. */
  lang?: string;
}

/**
 * Selects between live speech recognition and the deterministic scripted demo.
 * Both underlying hooks run every render (rules of hooks) and the result is
 * projected onto the unified {@link VoiceSession}. Live mode's orb state is
 * `idle ↔ listening`; `thinking`/`speaking` arrive with TTS in a later phase.
 */
export function useVoiceSession(
  options: UseVoiceSessionOptions = {},
): VoiceSession {
  const { lang = "en-US" } = options;
  const demo = useVoiceDemoSequence();
  const stt = useSpeechRecognition({ lang });

  const mode: VoiceMode = options.mode ?? (stt.isSupported ? "live" : "demo");

  if (mode === "demo") {
    return {
      mode: "demo",
      state: demo.state,
      isActive: demo.isActive,
      revealed: demo.revealed,
      transcript: "",
      interim: "",
      isSupported: stt.isSupported,
      error: null,
      toggleMic: demo.toggleMic,
    };
  }

  return {
    mode: "live",
    state: stt.isListening ? "listening" : "idle",
    isActive: stt.isListening,
    revealed: false,
    transcript: stt.transcript,
    interim: stt.interim,
    isSupported: stt.isSupported,
    error: stt.error,
    toggleMic: stt.isListening ? stt.stop : stt.start,
  };
}
