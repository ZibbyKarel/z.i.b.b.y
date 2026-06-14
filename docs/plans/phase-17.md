# Phase 17 — Real voice input (live speech-to-text)

> Delivers the STT half of ROADMAP **§7.1** (Voice and operator UX). The voice
> screen has shipped as a fully-styled JARVIS takeover since the start, but the
> session under it (`useVoiceDemoSequence`) is a **scripted timer** — the mic
> button cycles a hardcoded `demo.*` conversation; nothing captures real audio.
> The roadmap's "Where we are today" table wrongly marked voice ✅ delivered.
> This phase makes the microphone real.

## Why this is the phase (gap analysis, 2026-06-14)

Per LOOP.md priority axis (1 = missing user-facing functionality, mock → real).
A code-level gap analysis (not roadmap claims) found the **only** true
user-facing mock left: the voice operator interface — a North-Star capability
("a personal JARVIS", voice-first butler). No `phase-7` commit ever landed;
`VoiceScreen` renders `t("demo.user1")…` and `toggleMic` runs a `setTimeout`
sequence. Everything else the roadmap calls delivered is genuinely wired to the
API. Phases 14–16 were test-infra/CI (explicitly **not** valid phases under
LOOP.md) — so this is the first real functional slice since Phase 13.

## Scope (one iteration)

Replace the scripted session with real `SpeechRecognition`, behind a
`live | demo` seam so unsupported browsers and tests stay deterministic.
**STT only** — TTS (`useSpeech`), the `parseUtterance` action grammar, the
reconnect-backoff ladder, Chrome on-device opt-ins, and the wake word are the
next phase(s). The existing Phase-11.4 seam already routes the utterance to the
unified composer, so a real transcript flows straight to `createTask` with no
new plumbing.

## Deliverables

1. **`features/voice/hooks/useSpeechRecognition.ts`** — wraps
   `window.SpeechRecognition ?? webkitSpeechRecognition`; SSR-guarded, resolved
   once on mount. `continuous` + `interimResults`; exposes
   `{ isSupported, isListening, transcript, interim, error, start, stop }`.
   Error mapped to a closed union `mic-denied | unsupported | network |
   service-denied` (`not-allowed`/`audio-capture` → `mic-denied` and kill the
   loop; `no-speech`/`aborted` suppressed as normal noise). Bounded silent-drop
   restart: Chrome ends continuous sessions after ~60 s of silence with a plain
   `onend`; restart while an `active` flag is set, capped at 5 consecutive
   restarts, counter reset on every real result.
2. **`features/voice/hooks/useVoiceSession.ts`** — the single seam the screen
   consumes. Returns the extended `VoiceSession` shape (`mode`, `state`,
   `isActive`, `revealed`, `transcript`, `interim`, `isSupported`, `error`,
   `toggleMic`). `mode` defaults to `live` when STT is supported, else `demo`;
   live state is `idle ↔ listening` (thinking/speaking arrive with TTS). Demo
   path delegates to the existing `useVoiceDemoSequence` unchanged.
3. **`VoiceScreen.tsx`** — consume `useVoiceSession({ lang })` (lang from the
   locale cookie via `useLocale`: `cs → cs-CZ`, else `en-US`). In live mode the
   transcript shows the real finalized utterance, interim words render as ghost
   text under the orb, `handToTask` hands the **real** transcript to the
   composer (disabled until something is said). Unsupported → a note + the demo
   fallback; recognition errors render in a `role="alert"`.
4. **i18n** (`cs` + `en`): `micStartLive`/`micStopLive`, `unsupported`,
   `error.{mic-denied,network,service-denied}`, `hintLive`, `listeningGhost`.
5. **Test seam**: `vitest.setup.tsx` installs a `MockSpeechRecognition`
   (EventTarget-free, exposes `__emitResult`/`__emitError`/`__emitEnd` helpers)
   on `window`. Extend `vitest.components.config.ts` include with
   `features/*/hooks/**/*.test.{ts,tsx}` (hooks weren't covered before).

## Tests (added this phase)

- `useSpeechRecognition.test.tsx`:
  - unsupported browser (no ctor) → `isSupported: false`, `start()` sets
    `error: "unsupported"`.
  - `start()` → `isListening` true on `onstart`; a final result populates
    `transcript` and clears `interim`; an interim result populates `interim`.
  - `not-allowed` error → `error: "mic-denied"` and no auto-restart on the next
    `onend`; `network` → `error: "network"`; `no-speech` is ignored.
  - silent `onend` while active restarts (recognizer `.start()` called again);
    after 5 consecutive restarts it stops.
- `useVoiceSession.test.tsx`:
  - supported → `mode: "live"`, `toggleMic` starts recognition, a final result
    surfaces as `transcript`.
  - unsupported → `mode: "demo"`, delegates to the scripted sequence.
  - `mode: "demo"` forced even when supported → demo path.
- `VoiceScreen.test.tsx` (web-components): live mode renders the spoken
  transcript line and enables "new task from this"; unsupported renders the
  fallback note. Demo mode unchanged.

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components
vitest green (incl. the new hook + screen tests) → full `pnpm test` green →
`graphify update .`. Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next phases)

- **TTS** (`useSpeech`): voices via `voiceschanged`, utterance-held-in-ref bug
  hardening, gesture-gated queue, speak run outcomes/approvals aloud.
- **Action grammar** (`parseUtterance`): approve/reject/stop/navigate/close
  cs+en, diacritics-insensitive matching.
- Reconnect exponential backoff ladder, Chrome `processLocally` + phrase
  biasing, Settings → Voice (live/demo, language, voice picker), wake word.
