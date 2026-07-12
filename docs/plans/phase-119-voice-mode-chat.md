# Phase 119 — Voice mode for the Chat UI

## Motivation

Phase 120 gave the chat a manual per-message "read aloud" button on top of the
`speakd` TTS proxy. This phase delivers the arc phase 120 explicitly deferred:
**voice mode** — a hands-free conversational loop on `/chat`. Mic in, spoken reply
out, turn-taking in between. It is a **fresh, chat-native build**, not a
resurrection of the deleted `features/voice` module (removed in `3ef70a88`;
`ROADMAP.md:38` still claims that loop as delivered — corrected in 119e).

## Grounding (what exists today)

- **TTS**: `POST /api/speech/synthesize` (base64 WAV, default `language "cs"`,
  optional `voice`/`speed`), `GET /api/speech/voices` and `GET /api/speech/status`
  — the latter two are **defined but unconsumed** in web. The daemon enforces
  `max_chars = 1200` per request and speaks one request at a time (queue 4).
- **No STT anywhere** — `speakd` is TTS-only, no whisper proxy exists. Mic input
  is therefore **client-side Web Speech API** (`webkitSpeechRecognition`), the same
  zero-backend approach the deleted arc used (`docs/research/phase7-voice-web-speech.md`).
- **Chat**: `useChatStream(conversationId, { onComplete })` hands the finished
  turn's full text to `ChatScreen` — the auto-speak hook point. The composer is the
  generic `CommandLine` in send-delegation mode; `ChatScreen.send(text)` is a plain
  local function — voice input can call it **directly, bypassing the composer**
  (no `CommandLine` API changes).
- **Player**: `useAudioPlayback.ts` is a module-level singleton
  (`playAudioPlayback(key, b64)` / `stopAudioPlayback()` / `getPlayingKey()`),
  callable outside components. Single-player invariant already enforced.
- **Settings**: cross-device knobs go into `SystemConfigSchema`
  (`libs/contracts/src/system/system.schema.ts`, `.strict()`, everything
  `.default(...)`) surfaced via the spread-PUT pattern (`ChatUiSection.tsx`).

## Decisions

1. **Voice input bypasses the composer.** A final STT transcript calls
   `ChatScreen`'s `send(text)` directly; interim text renders in a voice status
   strip above the composer, not inside `CommandLine`. Phase 118's composer split
   stays untouched.
2. **Voice mode is ChatScreen-local, ephemeral state.** It does not survive
   navigation (leaving `/chat` stops listening and speaking — cleanup on unmount).
   No persistence of the on/off state.
3. **STT is Web Speech API, feature-detected.** No backend STT in this phase.
   Recognition language follows the app locale (`cs` → `cs-CZ`, `en` → `en-US`).
   Unsupported browser → mic button hidden, voice mode unavailable (tooltip via
   `title`/aria on a disabled control is NOT used — the affordance simply isn't
   rendered; an unlabeled dead button would violate the interaction grammar).
4. **Auto-speak only in voice mode.** With voice mode off, behavior is exactly
   phase 120 (manual button only). Enabling voice mode is a user gesture, which
   satisfies the browser's activation requirement for subsequent programmatic
   `play()`; if `play()` still rejects, the player's existing `toastBus` path
   reports it — never silent.
5. **Chunked sequential synthesis, no streaming endpoint.** Replies longer than
   the daemon's 1200-char cap are sentence-split client-side into ≤1000-char
   chunks, synthesized and played sequentially (chunk *n+1* synthesizes while
   *n* plays). Exposing the daemon's `?stream=1` mode over SSE stays deferred
   (explicit non-goal, see below).
6. **Single-player invariant extends to voice.** Auto-speak uses one well-known
   player key (`"voice-mode"`). Barge-in stops playback: starting the mic, sending
   a message (typed or spoken), toggling voice mode off, unmounting `ChatScreen`,
   or clicking any phase-120 read-aloud button (the player already supersedes).
7. **Turn-taking is explicit.** In voice mode the mic is armed only when idle:
   it disarms while a turn is thinking/streaming and while a reply is speaking,
   and **re-arms automatically** after the reply finishes playing (the hands-free
   loop). A recognition error (`mic-denied` etc.) drops voice mode off with a toast.
8. **Voice choice is a SystemConfig knob, not per-message UI.**
   `ttsVoice: z.string().min(1).nullable().default(null)` (null = daemon default).
   Both auto-speak *and* the phase-120 read-aloud button pass
   `voice: config?.ttsVoice ?? undefined`. No `speed` knob (YAGNI — schema already
   supports it if ever needed).
9. **Scene reacts to voice.** `SceneMode` gains `"speaking"` (visuals derived from
   `streaming` with a distinct accent in `modeVisuals.ts`); the existing
   `listening` mode is driven by actual mic listening, not just a draft.

## Non-goals

- No SSE streaming synthesis proxy (daemon `?stream=1` stays unexposed).
- No backend STT / whisper daemon.
- No wake word, no push-to-talk keybinding, no spoken briefing.
- No resurrection of `parseUtterance` command grammar — a spoken utterance is a
  chat message; chat's MCP tools are the command surface now.

## Sub-phases

### 119a — STT hook + mic button + voice-mode state

- `apps/web/features/chat/hooks/useSpeechRecognition.ts` — wraps
  `SpeechRecognition`/`webkitSpeechRecognition`: `{ supported, listening, interim,
  start, stop }` + `onFinal(text)` / `onError(kind)` callbacks; closed error union
  (`mic-denied` / `unsupported` / `network` / `aborted`). Ambient typings in
  `apps/web/features/chat/hooks/speechRecognition.d.ts` (TS `lib.dom` has no
  `SpeechRecognition` types).
- `ChatScreen.tsx`: voice-mode toggle (mic icon button, top-bar cluster; rendered
  only when `supported`), voice status strip (listening indicator + interim
  transcript) above the composer, final transcript → `send(text)`.
- `SceneMode` `listening` wired to real mic state while voice mode is on.
- Testid enum + i18n keys (`chat.voice.*`, cs+en).
- Tests (jsdom): recognition mock (recreate a minimal
  `apps/web/test/speechRecognitionMock.ts`), hook lifecycle (start/stop/final/
  error/unsupported), ChatScreen-level: toggle renders only when supported,
  final result sends, toggling off stops recognition.

### 119b — Auto-speak with chunking

- Extend `useAudioPlayback.ts`: `playAudioPlayback(key, b64, onSettled?)` — the
  callback fires exactly once when that specific playback ends, errors, or is
  superseded/stopped (identity-guarded like the existing `settle`).
- `apps/web/features/chat/hooks/useAutoSpeak.ts` — orchestrator:
  `speak(turnText)` sentence-splits into ≤1000-char chunks (hard-split any
  oversized sentence), synthesizes via `apiClient.speech.synthesize` sequentially
  with one-chunk prefetch, plays under key `"voice-mode"`, `cancel()` clears the
  queue + stops playback. Synthesis failure mid-queue: toast (global mutation
  path or explicit `toastBus`) + cancel remainder.
- `ChatScreen.tsx`: in voice mode, `useChatStream`'s `onComplete` → `speak(turn.text)`;
  all barge-in triggers from Decision 6 call `cancel()`. `SceneMode "speaking"`
  while the voice queue is active; `modeVisuals.ts` entry.
- Tests: chunker (boundaries, oversize sentence, ≤1200 invariant), queue advance
  on settle, cancel mid-queue, supersession by manual read-aloud.

### 119c — Voice picker + speakd status in settings

- Contract: add `ttsVoice` to `SystemConfigSchema` (nullable, default null) —
  contract-first, then API compiles unchanged (defaults absorb old files).
- Web: `apps/web/features/speech/queries/useSpeechVoicesQuery.ts` +
  `useSpeechStatusQuery.ts` (new `speech` domain folder; phase-120's synthesize
  mutation stays in `features/chat` — note, don't move).
- Settings: extend `ChatUiSection.tsx` (same tab) with a voice picker
  `SelectField` — "Auto (daemon default)" + entries from `listVoices`
  (label + language), spread-PUT `ttsVoice` on change, instant-apply. A compact
  daemon status line from `getStatus` (reachable/state/defaultVoice); when
  voices errors (503 daemon down), show the section's inline error state, not a
  broken picker.
- `ChatMessage.tsx` read-aloud + 119b auto-speak both pass
  `voice: config?.ttsVoice ?? undefined`.
- Tests: queries' key exports, section renders voices + writes spread-PUT,
  daemon-down state, synthesize body includes configured voice.

### 119d — Hands-free turn-taking

- `ChatScreen.tsx` voice-mode reducer: `idle → listening → thinking/streaming →
  speaking → listening` — after the auto-speak queue settles (and voice mode is
  still on, no error), re-arm the mic. Recognition `mic-denied`/`network` error
  → voice mode off + toast.
- Guard against re-arm loops: re-arm only from a completed `speaking` state,
  never after manual read-aloud playback.
- Tests: full-loop state transitions with mocked recognition + player.

### 119e — Docs sweep

- Fix stale `ROADMAP.md:38` (old Voice loop removed in `3ef70a88`; phase 119 is
  the chat-native replacement).
- `docs/web/overview.md` + `docs/web/chat-cosmic-scene.md`: voice-mode section,
  `speaking` scene mode.
- Mark this plan complete.

## Verify (every sub-phase)

```
rtk pnpm check:lint
rtk pnpm check:types
rtk pnpm test
```

`speakd` may be down throughout — nothing requires a live daemon (voices/status
queries degrade per 119c; synthesize failures toast).

## Status

**Delivered 2026-07-12.** All five sub-phases landed on `feat/voice-mode-chat`;
this file is complete.

| Sub-phase | Commit | Summary |
| --- | --- | --- |
| 119a | `51589e13` | STT hook (`useSpeechRecognition`) + mic toggle + voice status strip |
| 119b | `d886efbf` | Auto-speak: chunked sequential TTS (`useAutoSpeak`) + `speaking` `SceneMode` |
| 119c | `bfd1be76` | `ttsVoice` knob, settings voice picker + speakd status line, `features/speech` queries |
| 119d | `82e2366b` | Hands-free turn-taking: idle-gated mic via `suspended`, `voicePaused` latch, `useAnyAudioPlaying` echo guard |
| 119e | (this change) | Docs sweep |

Review findings fixed along the way:

- **119a** — the mic-denied error toast was generic; gave it its own actionable
  copy (`chat.voice.errorMicDenied`, distinct from the generic
  `chat.voice.error`) telling the operator to allow mic access in site settings.
- **119b** — `playAudioPlayback`'s settle path didn't distinguish *why* a
  playback ended; added `PlaybackSettleReason` (`ended`/`error`/`stopped`/
  `superseded`) so a manual read-aloud click mid-reply (barge-in) tears the
  auto-speak queue down instead of being mistaken for the queue's own chunk
  advancing.
- **119d** — voice-mode turn-taking only suspended the mic for its own
  auto-speak queue, missing the case of a manual phase-120 read-aloud playing
  concurrently; added `useAnyAudioPlaying` so the mic also disarms for that
  playback, closing the echo/self-talk hazard (mic transcribing the speakers).
