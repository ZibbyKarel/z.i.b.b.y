"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The recognition failure modes the chat UI distinguishes — a closed union so
 * the caller never has to interpret a raw browser error string. `not-allowed` /
 * `audio-capture` collapse to `mic-denied` (a hard stop); an unexpected `abort`
 * surfaces as `aborted`; a `network` / `service-not-allowed` / any other fault
 * buckets to `network`; and calling `start()` in a browser with no support
 * reports `unsupported`. `no-speech` is normal session noise and never surfaces.
 */
export type SpeechRecognitionErrorKind = "mic-denied" | "unsupported" | "network" | "aborted";

export interface UseSpeechRecognitionOptions {
  /** BCP-47 recognition language, derived from the app locale (`cs-CZ` / `en-US`). */
  lang: string;
  /** Fired once per finalized utterance (already trimmed, diacritics intact). */
  onFinal: (text: string) => void;
  /** Fired on a surfaced recognition fault (closed union above). */
  onError: (kind: SpeechRecognitionErrorKind) => void;
}

export interface SpeechRecognitionControls {
  /** Whether this browser exposes the Web Speech recognition API. */
  supported: boolean;
  /** True between `onstart` and `onend` — the mic is live. */
  listening: boolean;
  /** In-progress, not-yet-final words — ghost text while speaking. */
  interim: string;
  start: () => void;
  stop: () => void;
}

function resolveCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** Cap on *consecutive* silent-drop restarts (Chrome ends continuous sessions
 * roughly every 60 s); reset on every real result so a healthy session keeps
 * restarting, but a flapping recognizer can't spin forever. */
const MAX_SILENT_RESTARTS = 5;

/**
 * Live speech-to-text over the browser's Web Speech API — SSR-safe (support is
 * resolved once on the client), feature-detected, and resilient to Chrome's
 * silent drop of continuous sessions (a bare `onend` while the session should
 * still be live triggers a bounded restart). A finalized utterance is handed to
 * `onFinal`; faults collapse to the {@link SpeechRecognitionErrorKind} union via
 * `onError`. The recognizer is built once; the latest `lang`/callbacks are read
 * through refs so changing them never rebuilds the session.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions,
): SpeechRecognitionControls {
  // Resolved once, lazily — window-guarded so it's `false` on the server and
  // can't mismatch during hydration (the mic toggle mounts client-side only).
  const [supported] = useState(() => resolveCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Whether the session *should* be live — gates silent-drop restarts so an
  // intentional stop() never re-arms the recognizer.
  const activeRef = useRef(false);
  const restartsRef = useRef(0);

  // Latest option values, read from the recognizer's own callbacks without
  // rebuilding it.
  const langRef = useRef(options.lang);
  const onFinalRef = useRef(options.onFinal);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    langRef.current = options.lang;
    onFinalRef.current = options.onFinal;
    onErrorRef.current = options.onError;
  });

  // Build the recognizer once on the client. State only changes via the
  // recognizer's own event callbacks below — never synchronously in this body.
  useEffect(() => {
    const Ctor = resolveCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => setListening(true);

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
        setInterim("");
        onFinalRef.current(finalChunk.trim());
      } else {
        setInterim(interimChunk);
      }
    };

    rec.onerror = (e) => {
      const code = e.error;
      if (code === "no-speech") return; // normal silence, not a fault
      if (code === "not-allowed" || code === "audio-capture") {
        activeRef.current = false; // permission denial is a permanent stop
        setListening(false);
        onErrorRef.current("mic-denied");
      } else if (code === "aborted") {
        // A `stop()`/`abort()` we initiated clears `activeRef` first, so only an
        // *unexpected* abort (still-active session) surfaces.
        if (activeRef.current) onErrorRef.current("aborted");
      } else {
        onErrorRef.current("network"); // network / service-not-allowed / other
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (activeRef.current && restartsRef.current < MAX_SILENT_RESTARTS) {
        restartsRef.current += 1;
        try {
          rec.lang = langRef.current;
          rec.start();
        } catch {
          activeRef.current = false; // start() throws if called too soon
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
      onErrorRef.current("unsupported");
      return;
    }
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
    setListening(false);
    setInterim("");
  }, []);

  return { supported, listening, interim, start, stop };
}
