"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferredVoiceURI } from "../voicePreference";

/** The two locales the voice interface speaks (BCP-47), from the locale cookie. */
export type SpeechLang = "cs-CZ" | "en-US";

export interface SpeechSession {
  /** Whether this browser exposes `speechSynthesis`. */
  isSupported: boolean;
  /** True between an utterance's `onstart` and `onend` — drives the orb. */
  isSpeaking: boolean;
  /** Resolved voices (async — empty until `voiceschanged` fires). */
  voices: SpeechSynthesisVoice[];
  /** Speak a line; cancels anything already speaking first. */
  speak: (text: string, lang?: SpeechLang) => void;
  /** Cancel any in-flight speech. */
  stop: () => void;
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Pick the best voice for a locale: an exact locale match (preferring an on-device
 * `localService` voice), then a language-prefix fallback (`cs-*`), then the browser
 * default. Returns `null` when nothing matches — the utterance then uses the
 * browser's default voice for its `lang`.
 */
function selectVoice(
  voices: SpeechSynthesisVoice[],
  lang: SpeechLang,
): SpeechSynthesisVoice | null {
  const exact = voices.filter((v) => v.lang === lang);
  const local = exact.find((v) => v.localService);
  if (local) return local;
  if (exact[0]) return exact[0];

  const base = (lang.split("-")[0] ?? lang).toLowerCase();
  const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(base));
  if (prefix) return prefix;

  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

/**
 * Browser-native text-to-speech over `speechSynthesis` — free, on-device, zero
 * spend (the Phase 7 cost constraint). SSR-safe (support resolved once on the
 * client), and hardened against the documented TTS bugs: the utterance is held in
 * a ref until `onend` (GC otherwise kills the callback), `cancel()` precedes every
 * `speak()`, and `utterance.lang` is always set. The voice overlay only mounts
 * after a user gesture, so the autoplay policy is already satisfied.
 */
export function useSpeech(): SpeechSession {
  const [isSupported] = useState(speechSupported);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Holds the live utterance so it is not garbage-collected before onend fires.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  // Resolve voices once on the client; getVoices() is [] on first call, so wait
  // for voiceschanged (fires immediately when they were already cached).
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      if (list.length) setVoices(list);
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  // Cancel any in-flight speech if the screen unmounts (e.g. navigate/close).
  useEffect(() => {
    return () => {
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string, lang: SpeechLang = "cs-CZ") => {
      const spoken = text.trim();
      if (!spoken || !speechSupported()) return;
      const synth = window.speechSynthesis;
      synth.cancel(); // never queue on top of an older line

      const utt = new SpeechSynthesisUtterance(spoken);
      utteranceRef.current = utt; // prevent GC before onend
      // The operator's chosen voice wins when it's available; otherwise fall back
      // to the best locale match. Read at speak-time so a Settings change is live.
      const preferred = getPreferredVoiceURI();
      const chosen = preferred
        ? voicesRef.current.find((v) => v.voiceURI === preferred)
        : undefined;
      utt.voice = chosen ?? selectVoice(voicesRef.current, lang);
      utt.lang = lang; // always set — Android won't pick a voice otherwise
      utt.rate = 1.05;
      utt.onstart = () => setIsSpeaking(true);
      const done = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utt.onend = done;
      utt.onerror = done;
      synth.speak(utt);
    },
    [],
  );

  const stop = useCallback(() => {
    if (speechSupported()) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
  }, []);

  return { isSupported, isSpeaking, voices, speak, stop };
}
