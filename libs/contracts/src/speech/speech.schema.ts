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
  text: z.string().min(1),
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
