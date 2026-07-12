"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toastBus } from "../../../components/Toaster/toastBus";
import { type SpeechRecognitionErrorKind, useSpeechRecognition } from "./useSpeechRecognition";

/** App locale → BCP-47 recognition tag. Only `cs`/`en` catalogs exist; anything
 * else (and the `cs` default) speaks Czech. */
function localeToLang(locale: string): string {
  return locale.startsWith("en") ? "en-US" : "cs-CZ";
}

export interface UseVoiceModeOptions {
  /** A finalized utterance is a chat message — sent verbatim, bypassing the
   * composer (Decision 1). */
  onSend: (text: string) => void;
  /** Turn-taking gate (Phase 119d / Decision 7). While `true`, voice mode stays
   * ON but the mic is DISARMED — the conversation isn't idle (a turn is in
   * flight or a reply is speaking) or the operator took over via a manual
   * read-aloud (paused). `ChatScreen` computes it as
   * `thinking || speaking || paused`; the mic re-arms the instant it clears, on
   * the auto-speak settle transition (never a timer, so it can't catch the tail
   * of the TTS audio). Defaults to `false` — the plain 119a follow-the-toggle
   * behaviour. */
  suspended?: boolean;
}

export interface VoiceMode {
  /** Whether this browser supports STT — the toggle is only rendered when true. */
  supported: boolean;
  /** Whether voice mode is switched on (the toggle's state). */
  active: boolean;
  /** Whether the mic is actually live right now (drives `SceneMode` `listening`). */
  listening: boolean;
  /** In-progress transcript for the status strip. */
  interim: string;
  toggle: () => void;
}

/**
 * ChatScreen-local, ephemeral voice-mode state (Decision 2) over
 * {@link useSpeechRecognition}. Toggling on arms the mic; toggling off — or
 * unmounting (leaving `/chat`) — disarms it. A finalized utterance is handed to
 * `onSend` as a chat message. Any surfaced recognition fault drops voice mode
 * and surfaces a toast — never silent.
 *
 * Turn-taking (Phase 119d / Decision 7): the mic is armed only when voice mode
 * is on AND the conversation is idle — the caller raises `suspended` while a turn
 * is in flight, while a reply is speaking, and while paused after a manual
 * read-aloud took over. A single effect owns the complete arm/disarm condition
 * (`active && !suspended`) so there is no ping-pong between competing effects; the
 * mic re-arms on the state transition, never a timer.
 */
export function useVoiceMode({ onSend, suspended = false }: UseVoiceModeOptions): VoiceMode {
  const locale = useLocale();
  const t = useTranslations("chat");
  const [active, setActive] = useState(false);

  const handleFinal = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) onSend(trimmed);
    },
    [onSend],
  );

  const handleError = useCallback(
    (kind: SpeechRecognitionErrorKind) => {
      // Drop out of voice mode on any fault; the effect below stops the recognizer
      // when `active` flips false. The toast carries kind-specific copy: a blocked
      // microphone needs to say so — the generic mutation-error fallback would be
      // actively misleading there. Everything else gets the generic voice-fault line.
      setActive(false);
      toastBus.emit({ message: t(kind === "mic-denied" ? "voice.errorMicDenied" : "voice.error") });
    },
    [t],
  );

  const { supported, listening, interim, start, stop } = useSpeechRecognition({
    lang: localeToLang(locale),
    onFinal: handleFinal,
    onError: handleError,
  });

  // Arm the mic only when voice mode is on AND not suspended (idle turn-taking
  // window). The cleanup disarms it on every transition — toggling off, unmount,
  // or `suspended` flipping true — and the effect re-arms once it flips back
  // false. One effect, complete condition: no competing-effect ping-pong.
  useEffect(() => {
    if (!active || suspended) return;
    start();
    return () => stop();
  }, [active, suspended, start, stop]);

  const toggle = useCallback(() => {
    setActive((v) => !v);
  }, []);

  return { supported, active, listening, interim, toggle };
}
