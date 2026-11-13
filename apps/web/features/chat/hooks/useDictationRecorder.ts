"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranscribeSpeechMutation } from "../mutations";
import type { SpeechRecognitionErrorKind } from "./useSpeechRecognition";

export type DictationRecorderState = "idle" | "recording" | "transcribing";

export interface UseDictationRecorderOptions {
  /** BCP-47 / ISO language; only the primary subtag is sent (`cs-CZ` → `cs`). */
  lang: string;
  /** The transcript of one finished recording (non-empty, trimmed). */
  onFinal: (text: string) => void;
  /** `mic-denied` when the microphone is blocked, `network` for any other fault. */
  onError: (kind: SpeechRecognitionErrorKind) => void;
}

export interface DictationRecorder {
  /** Whether this runtime can record audio at all (`MediaRecorder` + `getUserMedia`). */
  supported: boolean;
  state: DictationRecorderState;
  /**
   * Transcript of the recording so far (refreshed while recording); `""` when idle. Kept
   * through `transcribing` and cleared when the final transcript lands (or fails).
   */
  interim: string;
  start: () => void;
  /** Ends the recording and sends it for transcription. No-op when not recording. */
  stop: () => void;
}

/** 32 kbps opus is plenty for speech; with the cap below a clip stays under ~1 MB base64
 * (the contract allows 4 MB). */
const AUDIO_BITS_PER_SECOND = 32_000;
/** Auto-stop (and transcribe) a recording that runs this long. */
const MAX_RECORDING_MS = 180_000;
/** MediaRecorder timeslice: a chunk (and so an interim transcription) every 2 s. */
const INTERIM_SLICE_MS = 2_000;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Dictation by recording (Decision B4): `start` opens the mic and collects chunks
 * with `MediaRecorder`; `stop` builds the blob, base64-encodes it and sends it to
 * `POST /api/speech/transcribe`, then hands the text to `onFinal`. While
 * recording, the cumulative clip is re-transcribed (one request at a time, failures
 * silent) to expose a progressive `interim`. A transcript is always delivered while
 * the hook is mounted — even if recording was restarted meanwhile
 * (several transcriptions may overlap).
 * Unmounting discards a recording in progress and any pending result.
 */
export function useDictationRecorder({
  lang,
  onFinal,
  onError,
}: UseDictationRecorderOptions): DictationRecorder {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(0);
  const [interim, setInterim] = useState("");
  const [supported] = useState(isSupported);
  const transcribe = useTranscribeSpeechMutation();
  // `recId` guards a stale getUserMedia (stop/unmount before the mic opened);
  // it is deliberately NOT consulted when delivering transcripts.
  const recId = useRef(0);
  const starting = useRef(false);
  const mounted = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const callbacks = useRef({ lang, onFinal, onError, mutateAsync: transcribe.mutateAsync });
  useEffect(() => {
    callbacks.current = { lang, onFinal, onError, mutateAsync: transcribe.mutateAsync };
  });

  const transcribeClip = useCallback(async (chunks: Blob[], type: string, id: number) => {
    setPending((n) => n + 1);
    try {
      const audioBase64 = await blobToBase64(new Blob(chunks, { type }));
      const { lang: language, mutateAsync } = callbacks.current;
      const res = await mutateAsync({
        body: { audioBase64, mimeType: type, language: language.split("-")[0] },
      });
      const text = res.status === 200 ? res.body.text.trim() : "";
      if (text && mounted.current) callbacks.current.onFinal(text);
    } catch {
      if (mounted.current) callbacks.current.onError("network");
    } finally {
      if (mounted.current) {
        setPending((n) => n - 1);
        // Drop the last interim with the final text (same batch); a newer recording owns it.
        if (recId.current === id) setInterim("");
      }
    }
  }, []);

  const start = useCallback(() => {
    if (!isSupported() || recorder.current || starting.current) return;
    const id = ++recId.current;
    starting.current = true;
    setInterim("");
    setRecording(true);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const release = () => stream.getTracks().forEach((t) => t.stop());
        if (recId.current !== id || !mounted.current) return release();
        starting.current = false;
        try {
          const mimeType = pickMimeType();
          const rec = new MediaRecorder(stream, {
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
            ...(mimeType ? { mimeType } : {}),
          });
          const chunks: Blob[] = [];
          let interimBusy = false; // per recording: one interim request in flight
          const cap: { id?: ReturnType<typeof setTimeout> } = {};
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
            if (recorder.current !== rec || rec.state !== "recording" || interimBusy) return;
            interimBusy = true;
            const type = rec.mimeType || mimeType || "audio/webm";
            // Cumulative from the first chunk: the webm header lives only there.
            // ponytail: re-sends the whole clip every slice; cap the interim window if backend load matters.
            void (async () => {
              try {
                const audioBase64 = await blobToBase64(new Blob(chunks, { type }));
                const { lang: language, mutateAsync } = callbacks.current;
                const res = await mutateAsync({
                  body: { audioBase64, mimeType: type, language: language.split("-")[0] },
                });
                if (res.status === 200 && recorder.current === rec && mounted.current)
                  setInterim(res.body.text.trim());
              } catch {
                // Interim is best-effort; the final transcription reports real failures.
              } finally {
                interimBusy = false;
              }
            })();
          };
          rec.onstop = () => {
            clearTimeout(cap.id);
            release();
            if (recorder.current === rec) recorder.current = null;
            if (!mounted.current) return;
            setRecording(false);
            if (chunks.length > 0)
              void transcribeClip(chunks, rec.mimeType || mimeType || "audio/webm", id);
            else setInterim("");
          };
          recorder.current = rec;
          rec.start(INTERIM_SLICE_MS);
          cap.id = setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_RECORDING_MS);
        } catch {
          // MediaRecorder rejected the stream/options — don't leave the mic indicator on.
          release();
          recorder.current = null;
          setRecording(false);
          callbacks.current.onError("network");
        }
      })
      .catch((error: unknown) => {
        if (recId.current !== id) return;
        starting.current = false;
        recorder.current = null;
        setRecording(false);
        const name = error instanceof DOMException ? error.name : "";
        callbacks.current.onError(
          name === "NotAllowedError" || name === "SecurityError" || name === "NotFoundError"
            ? "mic-denied"
            : "network",
        );
      });
  }, [transcribeClip]);

  const stop = useCallback(() => {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else if (starting.current) {
      // getUserMedia still pending — drop that start. (A transcription in flight is untouched.)
      recId.current++;
      starting.current = false;
      setRecording(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") rec.stop();
    };
  }, []);

  const state: DictationRecorderState = recording
    ? "recording"
    : pending > 0
      ? "transcribing"
      : "idle";
  return { supported, state, interim, start, stop };
}
