"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The recognition failure modes the UI distinguishes — a closed union so the
 * screen never has to interpret a raw browser error string. `not-allowed` /
 * `audio-capture` collapse to `mic-denied` (and permanently kill the retry
 * loop); `no-speech` / `aborted` are normal session noise and never surface.
 */
export type SpeechRecognitionError = "mic-denied" | "unsupported" | "network" | "service-denied";

export interface SpeechRecognitionSession {
  /** Whether this browser exposes the Web Speech recognition API. */
  isSupported: boolean;
  isListening: boolean;
  /** The last finalized utterance (diacritics intact — raw for the task text). */
  transcript: string;
  /** In-progress, not-yet-final words — ghost text while speaking. */
  interim: string;
  error: SpeechRecognitionError | null;
  start: () => void;
  stop: () => void;
}

// Minimal structural types for the Web Speech API — TS's lib.dom does not ship
// the (webkit-prefixed) recognition surface, so we model only what we touch.
interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  isFinal: boolean;
  0: SpeechAlternativeLike;
}
interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function resolveCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Cap on *consecutive* silent-drop restarts; reset on every real result. */
const MAX_SILENT_RESTARTS = 5;

export interface UseSpeechRecognitionOptions {
  /** BCP-47 tag, e.g. `cs-CZ` / `en-US`. Defaults to `en-US`. */
  lang?: string;
}

/**
 * Live speech-to-text over the browser's Web Speech API. SSR-safe (resolves
 * support once on the client), feature-detected, and resilient to Chrome's
 * silent ~60 s drop of continuous sessions: a plain `onend` while the session
 * should still be live triggers a bounded restart. The hard failures
 * (`mic-denied`) stop the loop permanently; transient ones surface as `error`
 * without tearing the session down.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): SpeechRecognitionSession {
  const { lang = "en-US" } = options;

  // Resolved once, lazily — SSR-safe (window-guarded → false on the server).
  // The consuming voice screen only mounts after a user gesture, so this never
  // runs during hydration and cannot mismatch.
  const [isSupported] = useState(() => resolveCtor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechRecognitionError | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the session *should* be live — gates silent-drop restarts so an
  // intentional stop() never re-arms the recognizer.
  const activeRef = useRef(false);
  const restartsRef = useRef(0);
  const langRef = useRef(lang);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Build the recognizer once on the client. State only changes via the
  // recognizer's own event callbacks below — never synchronously in this body.
  useEffect(() => {
    const Ctor = resolveCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => setIsListening(true);

    rec.onresult = (e) => {
      restartsRef.current = 0; // a result proves the session is healthy
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += text;
        else interimChunk += text;
      }
      if (finalChunk) {
        setTranscript(finalChunk.trim());
        setInterim("");
      } else {
        setInterim(interimChunk);
      }
    };

    rec.onerror = (e) => {
      const code = e.error;
      if (code === "no-speech" || code === "aborted") return; // normal noise
      if (code === "not-allowed" || code === "audio-capture") {
        activeRef.current = false; // permanently kill the retry loop
        setError("mic-denied");
      } else if (code === "service-not-allowed") {
        setError("service-denied");
      } else {
        setError("network"); // conservative bucket (incl. "network")
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setInterim("");
      // Chrome silently drops continuous sessions; restart while we should be
      // live, bounded so a flapping recognizer can't spin forever.
      if (activeRef.current && restartsRef.current < MAX_SILENT_RESTARTS) {
        restartsRef.current += 1;
        try {
          rec.lang = langRef.current;
          rec.start();
        } catch {
          activeRef.current = false; // start() can throw if called too soon
        }
      } else {
        activeRef.current = false;
      }
    };

    recognitionRef.current = rec;

    return () => {
      activeRef.current = false;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      setError("unsupported");
      return;
    }
    setError(null);
    setTranscript("");
    setInterim("");
    restartsRef.current = 0;
    activeRef.current = true;
    rec.lang = langRef.current;
    try {
      rec.start();
    } catch {
      /* already started — ignore */
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    setIsListening(false);
    setInterim("");
  }, []);

  return { isSupported, isListening, transcript, interim, error, start, stop };
}
