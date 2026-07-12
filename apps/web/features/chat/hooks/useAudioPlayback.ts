import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toastBus } from "../../../components/Toaster/toastBus";

/**
 * Single shared "read aloud" audio player for the chat transcript (Phase 120).
 * Chat should never speak two messages at once, so playback state is a
 * module-level singleton: `useAudioPlayback(key)` gives each `<ChatMessage>`
 * button a `useSyncExternalStore` view onto it, keyed by a caller-supplied id
 * (its own `useId()`), so every mounted button agrees on which one — if any —
 * is currently playing, with no context or prop drilling.
 */

type Listener = () => void;

/**
 * Why a playback instance settled (Phase 119b):
 * - `"ended"` — natural end of the audio;
 * - `"error"` — a rejected `play()` or the element's `error` event (toasted);
 * - `"stopped"` — an external {@link stopAudioPlayback} call;
 * - `"superseded"` — a newer {@link playAudioPlayback} took the player over
 *   (the NEW audio is already starting — consumers must not stop it).
 * The auto-speak queue advances only on `"ended"`/`"error"`; a manual read-aloud
 * click mid-reply arrives as `"superseded"` and tears the queue down instead
 * (Decision 6 barge-in).
 */
export type PlaybackSettleReason = "ended" | "error" | "stopped" | "superseded";

let playingKey: string | null = null;
let audioEl: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
/** The current instance's `onSettled` callback (Phase 119b) — fired exactly once
 * with the reason that instance settled, then nulled. `null` both when nothing
 * is playing and when the caller passed no callback. */
let onSettledCb: ((reason: PlaybackSettleReason) => void) | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function teardown() {
  if (audioEl) {
    audioEl.pause();
    audioEl.onended = null;
    audioEl.onerror = null;
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  audioEl = null;
  objectUrl = null;
}

/**
 * Tear the current instance down and clear playback state, then fire its
 * `onSettled` callback exactly once with the {@link PlaybackSettleReason}
 * (Phase 119b). Every terminal path — natural `ended`, the element's `error`, an
 * external `stopAudioPlayback`, or being superseded by a newer
 * `playAudioPlayback` — funnels through here, so `onSettled` fires once and only
 * once per instance, and always with an accurate reason. The error toast is
 * derived from the reason (`"error"` is the only failed path). The callback runs
 * LAST, after state is already cleared (`playingKey`/`audioEl`/`objectUrl` reset
 * and `onSettledCb` nulled), so a re-entrant `playAudioPlayback` from inside the
 * callback (the auto-speak queue advancing to its next chunk) starts from a clean
 * slate and cannot double-fire.
 */
function finalize(reason: PlaybackSettleReason): void {
  teardown();
  playingKey = null;
  const cb = onSettledCb;
  onSettledCb = null;
  notify();
  if (reason === "error") toastBus.emit();
  cb?.(reason);
}

/** Stop whatever is currently playing, if anything. Safe to call unconditionally.
 * Fires the stopped instance's `onSettled` with reason `"stopped"` (Phase 119b). */
export function stopAudioPlayback(): void {
  if (playingKey === null) return;
  finalize("stopped");
}

/** Decode a base64 `audio/wav` payload (`synthesize`'s `audioBase64`) into a `Blob`. */
export function wavBase64ToBlob(audioBase64: string): Blob {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "audio/wav" });
}

/**
 * Play a base64 WAV under `key` — stops any previous playback first (single-
 * player invariant). The object URL is revoked on `ended`/`error`, or
 * immediately if a newer `playAudioPlayback`/`stopAudioPlayback` call
 * supersedes this one first (a stale `ended`/`error` firing after that is a
 * no-op — guarded by identity of the specific `Audio` element this callback
 * closes over, NOT by `key` alone: the same key can legitimately be replayed
 * before its previous instance's `ended`/`error` fires, e.g. a fast
 * stop→replay on the same message).
 *
 * A play/decode FAILURE (a rejected `play()`, or the element's `error` event —
 * e.g. a corrupt WAV) is never silent: besides tearing down, it emits on the
 * `toastBus`, the same surface `providers.tsx`'s `MutationCache.onError` uses
 * (a bare `emit()` renders the Toaster's localized error fallback — this
 * module is non-React, so it has no `t()`, exactly like the MutationCache
 * path). The identity guard in `settle` also makes the toast fire at most
 * once per instance when both failure signals arrive for the same audio.
 *
 * Phase 119b: an optional `onSettled` fires EXACTLY ONCE, with the
 * {@link PlaybackSettleReason}, when THIS specific playback instance ends,
 * errors, or is superseded/stopped — guarded by the same `Audio`-element identity
 * as `settle`, so a stale `ended`/`error` from an already-superseded instance
 * never fires it twice. A superseded instance's callback still fires — with
 * reason `"superseded"` (finalized directly here, NOT through the public
 * `stopAudioPlayback`, so the reason is accurate: consumers must be able to tell
 * "another player took over, its audio is already starting" apart from a plain
 * stop). The auto-speak orchestrator (`useAutoSpeak`) advances its chunk queue
 * only on `"ended"`/`"error"` and tears down on the rest; the Phase-120
 * read-aloud button passes no callback and is unaffected.
 */
export function playAudioPlayback(
  key: string,
  audioBase64: string,
  onSettled?: (reason: PlaybackSettleReason) => void,
): void {
  if (playingKey !== null) finalize("superseded");

  const url = URL.createObjectURL(wavBase64ToBlob(audioBase64));
  const audio = new Audio(url);
  playingKey = key;
  audioEl = audio;
  objectUrl = url;
  onSettledCb = onSettled ?? null;

  const settle = (reason: PlaybackSettleReason) => {
    if (audioEl !== audio) return;
    finalize(reason);
  };
  audio.onended = () => settle("ended");
  audio.onerror = () => settle("error");

  notify();
  void audio.play().catch(() => settle("error"));
}

/** The key currently playing, or `null` if nothing is. */
export function getPlayingKey(): string | null {
  return playingKey;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One button's view onto the shared player. `key` should be stable for the
 * button's lifetime (callers pass their own `useId()`); `isPlaying` is true
 * only while THIS key is the one playing. This hook only knows about
 * already-decoded audio — wiring the message text to a synthesize call is the
 * caller's job (see `ChatMessage.tsx` + `useSynthesizeSpeechMutation`).
 */
export function useAudioPlayback(key: string) {
  const currentKey = useSyncExternalStore(subscribe, getPlayingKey, () => null);
  const isPlaying = currentKey === key;

  const play = useCallback((audioBase64: string) => playAudioPlayback(key, audioBase64), [key]);
  const stop = useCallback(() => {
    if (getPlayingKey() === key) stopAudioPlayback();
  }, [key]);

  // Stop this instance's own playback on unmount — never leaves an orphaned
  // object URL/audio element playing after its button is gone.
  useEffect(() => {
    return () => {
      if (getPlayingKey() === key) stopAudioPlayback();
    };
  }, [key]);

  return { isPlaying, play, stop };
}
