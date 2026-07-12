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
 * Turn-taking (arming the mic only while idle, re-arming after a spoken reply)
 * is layered on in 119d; here the session simply follows the toggle.
 */
export function useVoiceMode({ onSend }: UseVoiceModeOptions): VoiceMode {
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

  // Voice mode on ⇒ arm the mic; off (or unmount) ⇒ the cleanup disarms it.
  useEffect(() => {
    if (!active) return;
    start();
    return () => stop();
  }, [active, start, stop]);

  const toggle = useCallback(() => {
    setActive((v) => !v);
  }, []);

  return { supported, active, listening, interim, toggle };
}
