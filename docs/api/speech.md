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
