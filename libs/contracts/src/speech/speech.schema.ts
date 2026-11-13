import { z } from "zod";

/**
 * `synthesize` request body — mirrors `speakd`'s `POST /v1/speak`
 * (`~/Workspace/tts` ARCHITECTURE §3 / D-0005): `{text, voice?, language?, speed?}`.
 * `format` is not exposed — the daemon only speaks `wav` today, and the ZIBBY
 * contract always asks for it, so there is nothing for a caller to choose.
 * `language` defaults to Czech, the daemon's primary (and currently only well
 * -supported) synthesis target (D-0007).
 */
export const SpeechSynthesizeInputSchema = z.object({
  text: z.string().min(1).max(8000),
  voice: z.string().min(1).optional(),
  language: z.string().min(1).default("cs"),
  speed: z.number().positive().optional(),
});
export type SpeechSynthesizeInput = z.infer<typeof SpeechSynthesizeInputSchema>;

/**
 * `synthesize` result. The daemon returns raw `audio/wav` bytes (+ `X-Speakd-*`
 * timing headers) — carried here as base64 JSON, the MVP transport named in
 * ARCHITECTURE §6 (streaming via `@Sse()` is a later phase, not this one).
 * `audioMs`/`synthMs` are `null` when the daemon didn't send its timing headers
 * (defensive — should always be present on a 200). `voice` echoes the voice id
 * that was requested, or `null` when the daemon's own default was used — the
 * daemon's `/v1/speak` response doesn't say which voice it actually picked.
 */
export const SpeechSynthesizeResultSchema = z.object({
  audioBase64: z.string(),
  format: z.literal("wav"),
  audioMs: z.number().nullable(),
  synthMs: z.number().nullable(),
  voice: z.string().nullable(),
});
export type SpeechSynthesizeResult = z.infer<typeof SpeechSynthesizeResultSchema>;

/** One voice from `GET /v1/voices` (ARCHITECTURE §3), field-for-field unchanged. */
export const SpeechVoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  language: z.string(),
  gender: z.string(),
  source: z.string(),
  license: z.string(),
});
export type SpeechVoice = z.infer<typeof SpeechVoiceSchema>;

/** The daemon's own state machine — `GET /v1/status` (ARCHITECTURE §3). */
export const SpeechDaemonStateSchema = z.enum(["loading", "ready", "degraded"]);
export type SpeechDaemonState = z.infer<typeof SpeechDaemonStateSchema>;

/**
 * `GET /api/speech/status` — a camelCased mirror of speakd's `GET /v1/status`
 * plus `reachable`, a concept the daemon itself has no notion of: `false` when
 * the daemon could not be reached at all (down, DNS failure, timeout), in which
 * case every other field carries a degraded placeholder (`state: "degraded"`,
 * `null` elsewhere) rather than the endpoint failing outright — callers can
 * always render a status line (mirrors `healthContract`'s "never fail silently").
 */
export const SpeechStatusSchema = z.object({
  /** Local speech-to-text (the local Hex app) readiness — independent of the TTS daemon. */
  stt: z.object({
    available: z.boolean(),
    /** Why STT is unavailable (missing binary/model/ffmpeg); absent when available. */
    reason: z.string().optional(),
  }),
  reachable: z.boolean(),
  state: SpeechDaemonStateSchema,
  engine: z.string().nullable(),
  model: z.string().nullable(),
  device: z.string().nullable(),
  defaultVoice: z.string().nullable(),
  queueDepth: z.number().nullable(),
  uptimeS: z.number().nullable(),
});
export type SpeechStatus = z.infer<typeof SpeechStatusSchema>;

/**
 * `transcribe` request body — one recorded dictation clip as base64 (the same
 * transport `synthesize` uses for audio). `mimeType` is what `MediaRecorder`
 * produced (webm/opus in Chromium/Electron, mp4/aac in Safari); the server
 * converts via ffmpeg. The 4 MB cap on the base64 string keeps the JSON body
 * under the API's 5 MB limit (a 60 s webm/opus clip is ~0.5-1 MB). `language`
 * defaults server-side to Czech.
 */
export const SpeechTranscribeInputSchema = z.object({
  audioBase64: z.string().min(1).max(4_000_000),
  mimeType: z.string().min(1),
  language: z.string().min(1).optional(),
});
export type SpeechTranscribeInput = z.infer<typeof SpeechTranscribeInputSchema>;

/** `transcribe` result — the cleaned transcript; empty string when no speech was heard. */
export const SpeechTranscribeResultSchema = z.object({ text: z.string() });
export type SpeechTranscribeResult = z.infer<typeof SpeechTranscribeResultSchema>;

/**
 * `startDictation` body — opens a streaming dictation session. `mimeType` is what
 * `MediaRecorder` produces (one continuous webm/opus or mp4 stream, uploaded chunk by
 * chunk to `POST /api/speech/dictation/:id/audio`); `language` defaults to Czech.
 */
export const SpeechDictationStartInputSchema = z.object({
  mimeType: z.string().min(1),
  language: z.string().min(1).optional(),
});
export type SpeechDictationStartInput = z.infer<typeof SpeechDictationStartInputSchema>;

/** `startDictation` result — the session id the audio/events/finish routes take. */
export const SpeechDictationSessionSchema = z.object({ id: z.string().min(1) });
export type SpeechDictationSession = z.infer<typeof SpeechDictationSessionSchema>;

/** One live update on `GET /api/speech/dictation/:id/events` — `final` is `true` exactly once, last. */
export const SpeechDictationUpdateSchema = z.object({ text: z.string(), final: z.boolean() });
export type SpeechDictationUpdate = z.infer<typeof SpeechDictationUpdateSchema>;
