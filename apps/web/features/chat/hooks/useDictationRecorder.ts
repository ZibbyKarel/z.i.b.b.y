"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPERATOR_TOKEN_HEADER } from "@zibby/contracts";
import { API_URL } from "../../../state/api";
import { readOperatorToken } from "../../../state/operatorToken";
import {
  useFinishDictationMutation,
  useStartDictationMutation,
  useTranscribeSpeechMutation,
} from "../mutations";
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
/** MediaRecorder timeslice: a chunk streams to the dictation session every 250 ms. */
const CHUNK_SLICE_MS = 250;

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

interface DictationStream {
  /** Queue one recorded chunk; uploads run strictly one at a time, in order. */
  push: (chunk: Blob) => void;
  /** Drain the uploads and finish the session: the full transcript, or `null` when the stream failed. */
  finish: () => Promise<string | null>;
  close: () => void;
}

interface DictationStreamDeps {
  mimeType: string;
  language: string;
  startSession: (body: { mimeType: string; language: string }) => Promise<string>;
  finishSession: (id: string) => Promise<string>;
  onInterim: (text: string) => void;
}

async function uploadChunk(id: string, chunk: Blob): Promise<void> {
  const res = await fetch(`${API_URL}/api/speech/dictation/${id}/audio`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      [OPERATOR_TOKEN_HEADER]: readOperatorToken(),
    },
    body: chunk,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
}

/**
 * One streaming dictation session. Any failure (start, upload, SSE drop) marks the
 * stream `failed`: it stops uploading and `finish()` resolves `null` so the caller
 * falls back to a one-shot transcription of the locally kept chunks. Chunks pushed
 * before the session id arrives wait in the same promise chain.
 */
function openDictationStream(deps: DictationStreamDeps): DictationStream {
  let failed = false;
  let closed = false;
  let source: EventSource | undefined;
  const fail = () => {
    failed = true;
    source?.close();
  };
  const idPromise = deps.startSession({ mimeType: deps.mimeType, language: deps.language });
  let queue: Promise<void> = idPromise.then((id) => {
    if (closed || typeof EventSource === "undefined") return;
    source = new EventSource(`${API_URL}/api/speech/dictation/${id}/events`);
    source.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as { text: string; final: boolean };
        if (!update.final) deps.onInterim(update.text.trim());
        else source?.close();
      } catch {
        // a malformed frame is ignored; the finish call carries the real transcript
      }
    };
    // The stream ended (or broke) before finish: the session is gone or unreachable.
    source.onerror = fail;
  }, fail);
  return {
    push: (chunk) => {
      queue = queue
        .then(async () => {
          if (!failed) await uploadChunk(await idPromise, chunk);
        })
        .catch(fail);
    },
    finish: async () => {
      await queue;
      if (failed) return null;
      try {
        return await deps.finishSession(await idPromise);
      } catch {
        return null;
      } finally {
        source?.close();
      }
    },
    close: () => {
      closed = true;
      source?.close();
    },
  };
}

/**
 * Dictation by recording (Decision B4): `start` opens the mic and collects chunks
 * with `MediaRecorder`. Chunks stream to a dictation session
 * (`docs/api/speech.md`), whose SSE updates drive `interim`; `stop` finishes the
 * session and hands the full text to `onFinal`. If the stream fails at any point the
 * locally kept chunks are sent to `POST /api/speech/transcribe` in one shot instead
 * (no live text, but the final transcript still arrives). A transcript is always delivered while
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
  const startDictation = useStartDictationMutation();
  const finishDictation = useFinishDictationMutation();
  // `recId` guards a stale getUserMedia (stop/unmount before the mic opened);
  // it is deliberately NOT consulted when delivering transcripts.
  const recId = useRef(0);
  const starting = useRef(false);
  const mounted = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const streams = useRef(new Set<DictationStream>());
  const callbacks = useRef({
    lang,
    onFinal,
    onError,
    mutateAsync: transcribe.mutateAsync,
    startAsync: startDictation.mutateAsync,
    finishAsync: finishDictation.mutateAsync,
  });
  useEffect(() => {
    callbacks.current = {
      lang,
      onFinal,
      onError,
      mutateAsync: transcribe.mutateAsync,
      startAsync: startDictation.mutateAsync,
      finishAsync: finishDictation.mutateAsync,
    };
  });

  const transcribeClip = useCallback(
    async (chunks: Blob[], type: string, id: number, stream: DictationStream) => {
      setPending((n) => n + 1);
      try {
        let text = (await stream.finish())?.trim();
        if (text === undefined) {
          // Stream failed: one-shot transcription of everything recorded locally.
          const audioBase64 = await blobToBase64(new Blob(chunks, { type }));
          const { lang: language, mutateAsync } = callbacks.current;
          const res = await mutateAsync({
            body: { audioBase64, mimeType: type, language: language.split("-")[0] },
          });
          text = res.status === 200 ? res.body.text.trim() : "";
        }
        if (text && mounted.current) callbacks.current.onFinal(text);
      } catch {
        if (mounted.current) callbacks.current.onError("network");
      } finally {
        stream.close();
        streams.current.delete(stream);
        if (mounted.current) {
          setPending((n) => n - 1);
          // Drop the last interim with the final text (same batch); a newer recording owns it.
          if (recId.current === id) setInterim("");
        }
      }
    },
    [],
  );

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
          const chunks: Blob[] = [];
          const rec = new MediaRecorder(stream, {
            audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
            ...(mimeType ? { mimeType } : {}),
          });
          const type = rec.mimeType || mimeType || "audio/webm";
          const dictation = openDictationStream({
            mimeType: type,
            language: callbacks.current.lang.split("-")[0] ?? "cs",
            startSession: async (body) => {
              const res = await callbacks.current.startAsync({ body });
              if (res.status !== 201) throw new Error(`start ${res.status}`);
              return res.body.id;
            },
            finishSession: async (sessionId) => {
              const res = await callbacks.current.finishAsync({
                params: { id: sessionId },
              });
              if (res.status !== 200) throw new Error(`finish ${res.status}`);
              return res.body.text;
            },
            onInterim: (text) => {
              if (recId.current === id && mounted.current) setInterim(text);
            },
          });
          streams.current.add(dictation);
          const cap: { id?: ReturnType<typeof setTimeout> } = {};
          rec.ondataavailable = (e) => {
            if (e.data.size === 0) return;
            chunks.push(e.data);
            dictation.push(e.data);
          };
          rec.onstop = () => {
            clearTimeout(cap.id);
            release();
            if (recorder.current === rec) recorder.current = null;
            if (!mounted.current) return;
            setRecording(false);
            if (chunks.length > 0) void transcribeClip(chunks, type, id, dictation);
            else {
              dictation.close();
              streams.current.delete(dictation);
              setInterim("");
            }
          };
          recorder.current = rec;
          rec.start(CHUNK_SLICE_MS);
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
    const openStreams = streams.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      openStreams.forEach((s) => s.close());
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
