# Speech (speakd TTS proxy)

A thin HTTP proxy in front of a **local, loopback-only** TTS daemon (`speakd`,
`~/Workspace/tts`, ARCHITECTURE §3 / D-0005) — not a ZIBBY-owned service. This
module establishes the **daemon-proxy pattern** for ZIBBY (ARCHITECTURE §6): no
storage of its own, every route is a pass-through to the daemon's `/v1/*` API,
reshaping its JSON error envelope to the repo's `{message}` `ErrorSchema`.

## Pieces

| Piece      | File                                                              | Role                                                                                                     |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/speech/speech.schema.ts`                      | `SpeechSynthesizeInputSchema`, `SpeechSynthesizeResultSchema`, `SpeechVoiceSchema`, `SpeechStatusSchema` |
| Contract   | `libs/contracts/src/speech/speech.contract.ts`                    | `speechContract` — 3 routes under `/api/speech`                                                          |
| Service    | `apps/api/src/speech/speech.service.ts`                           | `SpeechService` — the HTTP client to `speakd`                                                            |
| Controller | `apps/api/src/speech/speech.controller.ts`                        | implements `speechContract`, maps typed errors to status codes                                           |
| Errors     | `apps/api/src/speech/speech.errors.ts`                            | `SpeakdUnreachableError`, `SpeakdTimeoutError`, `SpeakdDaemonError`                                      |
| Module     | `apps/api/src/speech/speech.module.ts`                            | no imports beyond Nest — `LoggerService` is `@Global`                                                    |
| Fixtures   | `apps/api/src/speech/fixtures/*.json` + `speech.fixtures.test.ts` | the drift tripwire (see below)                                                                           |

## Environment variables

Confirmed in `apps/api/src/speech/speech.service.ts`:

| Var                 | Default                 | Role                                                                                          |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `SPEAKD_URL`        | `http://127.0.0.1:8899` | Base URL of the daemon — loopback-only per D-0005                                             |
| `SPEAKD_TIMEOUT_MS` | `30000`                 | Per-request timeout (`AbortSignal.timeout`); falls back to the default if unset/non-finite/≤0 |
| `SPEAKD_TOKEN`      | _(none)_                | If set, sent as `authorization: Bearer <token>` on every request                              |

Every call is bounded by `AbortSignal.timeout(SPEAKD_TIMEOUT_MS)` so a stuck
daemon can never hang a ZIBBY request — a fired abort becomes a typed
`SpeakdTimeoutError`, any other network failure a `SpeakdUnreachableError`.

## No compile-time link to the daemon

`SpeechService`'s doc comment is explicit: there is no shared types package
with `speakd`. The `fixtures/*.json` files (`voices.json`, `status.json`, the
four `error-*.json` shapes) plus `speech.fixtures.test.ts` are the drift
tripwire instead (mirrors an established `whisper`/D-0013 pattern elsewhere in
the codebase) — if the daemon's response shape changes, the fixture test is
where that gets caught, not a shared interface.

## Endpoints (`/api/speech`)

```
POST /speech/synthesize   → speakd POST /v1/speak     (200 | 400 | 409 | 422 | 503)
GET  /speech/voices       → speakd GET  /v1/voices    (200 | 503)
GET  /speech/status       → speakd GET  /v1/status    (200 always)
```

### `synthesize`

Request: `{ text, voice?, language? (default "cs"), speed? }`. `format` is
never exposed — the daemon only speaks `wav`, so there is nothing to choose.
Response carries the audio as **base64 JSON** (`audioBase64`, `format: "wav"`),
plus `synthMs`/`audioMs` timing pulled from the daemon's `X-Speakd-*` response
headers (`null` if absent) and `voice` (echoes the request, or `null` when the
daemon's own default was used — the daemon's response doesn't say which voice
it actually picked). Streaming via `@Sse()` is a later phase, not this one.

### Status-code mapping (from `speechContract`'s doc comment)

| Daemon outcome                       | ZIBBY status                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| unreachable / timeout / daemon `503` | `503`                                                                           |
| daemon `409` (`queue_full`)          | `409` (passthrough — no existing "upstream busy"/`429` convention in this repo) |
| daemon `422` (invalid text/speed)    | `422` (passthrough)                                                             |
| daemon `400` (unknown voice)         | `400` (passthrough)                                                             |

### `getStatus`

**Never fails** — mirrors `healthContract`'s "never fail silently" posture.
`SpeechService.status()` catches every failure mode (unreachable, timeout,
non-2xx, malformed body) and resolves to a fixed `reachable: false` object with
every other field `null`/`"degraded"`, so the endpoint always answers `200`
and callers can always render a status line.

## Dictation (`POST /api/speech/transcribe`, local STT)

Separate from `speakd`: `SttService` (`apps/api/src/speech/stt.service.ts`) uses the
locally running Hex app over its loopback HTTP API (language `cs` by default). Hex owns the
model. The one-shot `transcribe` route spawns nothing long-lived; a streaming session (below)
keeps one ffmpeg per session.

```
POST /speech/transcribe   body { audioBase64, mimeType, language? } → 200 { text }
GET  /speech/status       additionally carries stt: { available, reason? }
```

- `audioBase64` is capped at 4 MB (the API's JSON limit is 5 MB; a 60 s webm/opus clip is ~0.5-1 MB).
  `mimeType` is whatever `MediaRecorder` produced; ffmpeg converts it to a 16 kHz mono WAV
  (file-to-file in a temp dir, Hex rejects a piped WAV).
- Flow: the API reads Hex's discovery file `<hexDir>/local-api.json` (`port` + bearer `token`, removed
  when Hex quits) and posts the WAV to `http://127.0.0.1:<port>/transcriptions?model=<id>&language=<lang>`.
- Model: `HEX_MODEL`, else `transcription.model` in Hex's `settings.json`, else `parakeet_v3`.
- Statuses: `422` the clip could not be decoded by ffmpeg or Hex rejected it (4xx), `503` STT unavailable
  (Hex not running, ffmpeg missing, Hex unreachable, HTTP 401 or 5xx). `stt.available=false` carries a
  `reason`; the web app then falls back to the browser Web Speech API.
- Output is cleaned: whitespace collapsed, bracketed tags like `[BLANK_AUDIO]` removed.

### Streaming dictation sessions (`DictationStreamService`)

Hex only transcribes whole clips, so live text is built server-side: the browser uploads
`MediaRecorder` chunks into a session, one long-lived ffmpeg per session decodes them to
16 kHz mono s16le PCM as they arrive (`-loglevel error -i pipe:0 -f s16le -ar 16000 -ac 1 pipe:1`;
measured to stream incrementally from a pipe with no extra flags), and `DictationStreamSession`
(`dictation-stream.session.ts`) re-transcribes only the unsettled tail via
`SttService.transcribePcm` (WAV built in memory, no ffmpeg/temp files). At every pause
(>= 500 ms of silence with >= 1 s of audio before it) the audio before the pause is committed:
its text never changes again and its PCM is dropped, so each Hex request is about one phrase long.
An unbroken monologue is force-committed at its quietest point once the tail passes 20 s.

```
POST /api/speech/dictation             JSON { mimeType, language? } → 201 { id }        | 503
POST /api/speech/dictation/:id/audio   raw chunk, application/octet-stream → 204         | 404, 413
GET  /api/speech/dictation/:id/events  SSE, data: {"text":"…","final":false|true}        | 404
POST /api/speech/dictation/:id/finish  no body → 200 { text }                            | 404, 422, 503
```

- `audio` and `events` sit outside `speechContract` (raw bytes / SSE); `start` and `finish` are
  contract routes. Chunks are one continuous container stream: upload them **sequentially**; the
  server writes them to ffmpeg in arrival order (with backpressure). One chunk is capped at 1 MB.
- `events` replays the latest update to a late subscriber, skips updates whose text did not change,
  sends `ping` keep-alives every 25 s, and completes after the single `final: true` update (or when
  the session is destroyed). `text` is always the whole transcript so far, not a delta.
- `finish` closes ffmpeg's stdin, waits for all PCM, transcribes the rest and returns the full text.
  `422` = ffmpeg exited non-zero without decoding anything (or Hex rejected the audio), `503` = Hex
  unavailable; the session is gone either way, so keep the recording and fall back to
  `POST /speech/transcribe`.
- Limits: a session with no `audio` upload for 30 s, or older than 4 min, is destroyed (ffmpeg
  killed, stream completed, later calls `404`). At most 8 sessions are live at once — a further `POST /speech/dictation`
  answers `503`. Shutdown (`onModuleDestroy`) kills every ffmpeg.

Requirements (macOS): Hex running, and `brew install ffmpeg`.

Env: `HEX_MODEL`, `HEX_APPLICATION_SUPPORT_DIR` (see `docs/ops/environment.md`).
The desktop app grants the microphone only to its own origin (`apps/desktop/src/permissions.ts`,
`NSMicrophoneUsageDescription` via electron-builder `mac.extendInfo`; no entitlement is needed
while `hardenedRuntime` is false).

## Wired into the rest of the system

Nothing in `apps/api/src` beyond `SpeechModule` itself calls into
`SpeechService` — this is a leaf module with no other backend consumer today.
It exists purely as an HTTP surface for the web app / voice UI to hit.

## Gotchas

- `listVoices` is validated against `z.array(SpeechVoiceSchema)` — a shape
  drift from the daemon surfaces as a `SpeakdDaemonError` (`503`,
  `malformed_response`), never a silently-wrong list.
- `SpeechService` never throws from `status()`; it's the one method with no
  error branch in the controller.
- No subprocess involved, just `fetch` — `SpeechService` calls the global
  `fetch` directly (no injected client), so tests stub it with
  `vi.stubGlobal("fetch", ...)` (see `speech.service.test.ts`).
