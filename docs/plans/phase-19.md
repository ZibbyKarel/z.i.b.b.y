# Phase 19 — TTS read-back (`useSpeech`)

> Delivers the second half of ROADMAP **§7.1** (Voice in/out). Phase 17 made the
> mic real; Phase 18 made the voice *act*; Phase 19 makes ZIBBY **speak** — command
> acknowledgements are read aloud over the free, browser-native `speechSynthesis`.
> Closes the North-Star DoD's "spoken result" at zero spend.

## Why this is the phase (gap analysis, 2026-06-14)

LOOP.md priority #1 = missing user-facing functionality. Voice is the last 🚧 North
Star capability. STT (17) + command bridge (18) landed; the remaining functional gap
is the butler talking back — without it the loop "spoken task → run → spoken result"
is one-directional. TTS is fully browser-native (no spend, the §7 constraint),
deterministic to test (stubbed `speechSynthesis`), and self-contained.

## Scope (one iteration)

The `useSpeech` hook + wiring acks to it + a mute control + the orb `speaking` state.
**Not** in scope: reading run outcomes/approvals aloud beyond the ack, wake word,
Settings → Voice, reconnect ladder, on-device opt-ins.

## Deliverables

1. **`features/voice/hooks/useSpeech.ts`** — SSR-safe wrapper over
   `window.speechSynthesis`. `{ isSupported, isSpeaking, voices, speak(text,lang?),
   stop }`. Voices via the `voiceschanged` event in a `useEffect`; `selectVoice` =
   exact locale → `localService` → language-prefix → default. Bug hardening (per
   `docs/research/phase7-voice-web-speech.md`): utterance held in a ref until
   `onend` (GC), `cancel()` before every `speak()`, always set `utterance.lang`,
   cancel on unmount, SSR guards.
2. **`VoiceScreen.tsx`** — speak each new ack once (ref-debounced) in the locale tag;
   the speaker button becomes a mute toggle (`aria-pressed`, struck-through glyph,
   stops in-flight speech); orb + status gain a `speaking` state (`isSpeaking`
   outranks listen/idle).
3. **i18n** `voice.mute` / `voice.unmute` (cs + en).
4. **Test seam** `test/speechSynthesisMock.ts` — `MockSpeechSynthesis` +
   `MockSpeechSynthesisUtterance` + `fixtureVoices`, installed per-test (jsdom ships
   neither API), mirroring the Phase-17 STT mock.

## Tests (added this phase)

- `useSpeech.test.tsx`: support detection; `voiceschanged` resolves voices;
  `cancel()` precedes `speak()` and the locale is set on the utterance; the local
  exact-locale voice is chosen; `isSpeaking` toggles on `onstart`/`onend`; `stop()`
  cancels; an empty utterance is a no-op.
- `VoiceScreen.test.tsx`: an ack is spoken aloud (`speak("Schváleno.","cs-CZ")`); the
  speaker button mutes (`aria-pressed` flips + `stop()` called). Existing
  transcript/dispatch/ack/unsupported assertions stay green (speech hook mocked).

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest
green → full `pnpm test` green → `graphify update .`. Checkpoint commit (no push).

## Out of scope (→ next phases)

- Speak run outcomes + pending approvals aloud (richer read-back; depends on the
  1.3 outcome write-back already shipped — a small follow-up).
- Wake word (`@picovoice/porcupine-web` or `@ricky0123/vad-web`), Settings → Voice
  (live/demo, language, voice picker), reconnect exponential-backoff ladder, Chrome
  `processLocally` + phrase biasing.
