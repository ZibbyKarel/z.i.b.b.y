"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toastBus } from "../../../components/Toaster/toastBus";
import { apiClient } from "../../../state/api";
import {
  type PlaybackSettleReason,
  playAudioPlayback,
  stopAudioPlayback,
} from "./useAudioPlayback";

/** The single well-known player key auto-speak plays every chunk under, so the
 * module-level single-player invariant (`useAudioPlayback`) covers voice too:
 * a manual read-aloud, a new voice reply, or `stopAudioPlayback` supersedes it. */
export const VOICE_MODE_PLAYER_KEY = "voice-mode";

/** Target upper bound per synthesized chunk. Kept well under the `speakd`
 * daemon's hard `max_chars = 1200` reject (see the phase-119 plan / speech
 * contract) so a chunk never rides the limit. */
export const MAX_CHUNK_CHARS = 1000;

/**
 * Hard-split a single over-long sentence into ≤`maxChars` pieces, preferring a
 * break at the last whitespace inside the window so words stay intact; falls back
 * to a raw cut when a single "word" is itself longer than the window (a URL, a
 * hash) so the ≤`maxChars` invariant always holds.
 */
function hardSplit(sentence: string, maxChars: number): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    const space = rest.lastIndexOf(" ", maxChars);
    const cut = space > 0 ? space : maxChars;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Split reply text into speakable chunks ≤`maxChars`, respecting sentence
 * boundaries (a chunk holds whole sentences packed greedily) and hard-splitting
 * any single sentence that alone exceeds the window. Exported pure for testing.
 *
 * Sentences are delimited on terminal punctuation (`. ! ? …`) followed by
 * whitespace, and on blank/newline breaks — the same cheap, dependency-free
 * heuristic the deleted voice arc used; good enough for TTS phrasing, and the
 * daemon re-joins prosody per request anyway.
 */
export function chunkForSpeech(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      flush();
      chunks.push(...hardSplit(sentence, maxChars));
      continue;
    }
    if (current.length === 0) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChars) {
      current = `${current} ${sentence}`;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}

/** One active `speak()` run: its chunks, a per-index synth cache (so the
 * one-ahead prefetch and the play step share a single in-flight request), and a
 * cancelled flag. Reference identity (`sessionRef.current === session`) is the
 * supersession guard — a newer `speak()` swaps the ref and orphans this one. */
interface SpeakSession {
  chunks: string[];
  cancelled: boolean;
  synth: Map<number, Promise<string>>;
}

export interface UseAutoSpeakOptions {
  /** The operator's `/settings` voice pick (`SystemConfig.ttsVoice`, Phase 119c) —
   * `ChatScreen` reads it via `useSystemConfigQuery` and passes it straight
   * through. `null`/`undefined` (the common case) omits the override entirely so
   * the daemon uses its own default. */
  voice?: string | null;
}

export interface UseAutoSpeak {
  /** Speak `text` as a voice reply — sentence-chunked, synthesized sequentially
   * with one-ahead prefetch, played under {@link VOICE_MODE_PLAYER_KEY}. A second
   * call supersedes the first (its queue is cancelled and playback stopped). */
  speak: (text: string) => void;
  /** Clear the pending queue and stop playback. Idempotent. */
  cancel: () => void;
  /** True from the first synthesize kickoff until the last chunk settles (or
   * `cancel`) — drives `SceneMode` `"speaking"`. */
  speaking: boolean;
}

/**
 * The voice-reply orchestrator (Phase 119b). In voice mode, `ChatScreen` hands a
 * finished assistant turn to {@link speak}; it chunks the text, synthesizes each
 * chunk through the `speakd` proxy (`apiClient.speech.synthesize`) one-ahead of
 * playback (the daemon queue is depth 4 — one-ahead never overruns it), and plays
 * them back-to-back under the single voice player key.
 *
 * Advance rule: the player's `onSettled` reports WHY the chunk settled
 * ({@link PlaybackSettleReason}). We advance (or finish) only on `"ended"` and
 * `"error"` — a playback error just moves on to the next chunk, the player has
 * already toasted it. `"superseded"` means another player took the key over — a
 * manual phase-120 read-aloud click is the Decision-6 barge-in — so the session
 * is abandoned WITHOUT `stopAudioPlayback()` (the new audio is already playing;
 * stopping would kill it). `"stopped"` (an external stop not initiated by
 * {@link cancel}) likewise just abandons — playback is already gone. A barge-in
 * through {@link cancel} marks the session cancelled BEFORE stopping playback,
 * so the resulting `"stopped"` settle sees an inactive session and is a no-op.
 *
 * A synthesize failure mid-queue toasts `chat.voice.speakError` and cancels the
 * remainder.
 *
 * `options.voice` is read through a ref for the same reason as `t` below: the
 * controller (`speak`/`cancel`) is built once via `useMemo([])` so its identity
 * stays stable across re-renders (`useChatStream`'s `onComplete` depends on
 * `speak`) — a config change must not rebuild it, just change what the NEXT
 * `ensureSynth` call sends.
 */
export function useAutoSpeak(options: UseAutoSpeakOptions = {}): UseAutoSpeak {
  const { voice } = options;
  const t = useTranslations("chat");
  // `t` isn't referentially stable; hold it in a ref so `speak`/`cancel` can be
  // created once (stable identities keep `useChatStream`'s `onComplete` stable).
  // Written in an effect (never during render — `react-hooks/refs`); the toast it
  // feeds is only read from async callbacks, so a one-render lag is irrelevant.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Same pattern for the configured voice — see the doc comment above.
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const [speaking, setSpeaking] = useState(false);
  const sessionRef = useRef<SpeakSession | null>(null);

  const controller = useMemo(() => {
    const isActive = (session: SpeakSession) =>
      !session.cancelled && sessionRef.current === session;

    const ensureSynth = (session: SpeakSession, i: number, chunk: string): Promise<string> => {
      const existing = session.synth.get(i);
      if (existing) return existing;
      const p = (async () => {
        const currentVoice = voiceRef.current;
        const res = await apiClient.speech.synthesize.mutate({
          body: { text: chunk, ...(currentVoice ? { voice: currentVoice } : {}) },
        });
        if (res.status !== 200) throw new Error(`speech synthesize failed: ${res.status}`);
        return res.body.audioBase64;
      })();
      session.synth.set(i, p);
      return p;
    };

    const finish = (session: SpeakSession) => {
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setSpeaking(false);
      }
    };

    // Abandon a session WITHOUT touching the player. Used when the barge-in
    // arrived AS the player settling under us: `"superseded"` (a manual
    // read-aloud's audio is already playing — stopping would kill it) or an
    // external `"stopped"` (playback is already gone).
    const abandon = (session: SpeakSession) => {
      session.cancelled = true;
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setSpeaking(false);
      }
    };

    // Cancel a session: mark it cancelled and clear it BEFORE stopping playback,
    // so the `"stopped"` `onSettled` that `stopAudioPlayback` fires sees an
    // inactive session and does not advance the queue.
    const stop = (session: SpeakSession) => {
      abandon(session);
      stopAudioPlayback();
    };

    const fail = (session: SpeakSession) => {
      if (!isActive(session)) return;
      toastBus.emit({ message: tRef.current("voice.speakError") });
      stop(session);
    };

    const playChunk = (session: SpeakSession, i: number) => {
      if (!isActive(session)) return;
      const chunk = session.chunks[i];
      if (chunk === undefined) {
        finish(session);
        return;
      }
      // Synthesize THIS chunk first, then prefetch one ahead while it plays. The
      // prefetch's rejection is swallowed here (kept from becoming an unhandled
      // rejection); if we reach that chunk, the cached promise re-throws into
      // `playChunk`.
      const audioPromise = ensureSynth(session, i, chunk);
      const nextChunk = session.chunks[i + 1];
      if (nextChunk !== undefined) void ensureSynth(session, i + 1, nextChunk).catch(() => {});

      audioPromise
        .then((audioBase64) => {
          if (!isActive(session)) return;
          playAudioPlayback(VOICE_MODE_PLAYER_KEY, audioBase64, (reason: PlaybackSettleReason) => {
            if (!isActive(session)) return;
            // Advance/finish only when the chunk genuinely finished (or failed —
            // the player already toasted). A "superseded"/"stopped" settle is a
            // barge-in: abandon the queue and leave the player alone (on
            // supersession the new audio is already playing).
            if (reason === "ended" || reason === "error") {
              if (i + 1 < session.chunks.length) playChunk(session, i + 1);
              else finish(session);
              return;
            }
            abandon(session);
          });
        })
        .catch(() => fail(session));
    };

    const speak = (text: string) => {
      const prev = sessionRef.current;
      if (prev) stop(prev);
      const chunks = chunkForSpeech(text);
      if (chunks.length === 0) return;
      const session: SpeakSession = { chunks, cancelled: false, synth: new Map() };
      sessionRef.current = session;
      setSpeaking(true);
      playChunk(session, 0);
    };

    const cancel = () => {
      const session = sessionRef.current;
      if (session) stop(session);
      else stopAudioPlayback();
    };

    return { speak, cancel };
  }, []);

  // Leaving `/chat` (unmount) stops any in-flight reply — no `setSpeaking` here,
  // the component is going away.
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) session.cancelled = true;
      sessionRef.current = null;
      stopAudioPlayback();
    },
    [],
  );

  return { speak: controller.speak, cancel: controller.cancel, speaking };
}
