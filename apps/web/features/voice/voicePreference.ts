/**
 * The operator's chosen TTS voice, persisted client-side. It's a `voiceURI` —
 * browser/device-specific, never sent to the server — so it lives in localStorage,
 * not a cookie. `useSpeech` reads it at speak-time so a change in Settings takes
 * effect immediately, with no cross-component sync. An unset/empty preference means
 * "auto" (fall back to the locale-matched voice).
 */
const VOICE_PREF_KEY = "zibby.voice";

/** The preferred voiceURI, or `null` for auto (unset, or on the server). */
export function getPreferredVoiceURI(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(VOICE_PREF_KEY);
  return v && v.length > 0 ? v : null;
}

/** Persist the preferred voiceURI; `null`/empty clears it (back to auto). */
export function setPreferredVoiceURI(uri: string | null): void {
  if (typeof window === "undefined") return;
  if (uri && uri.length > 0) {
    window.localStorage.setItem(VOICE_PREF_KEY, uri);
  } else {
    window.localStorage.removeItem(VOICE_PREF_KEY);
  }
}
