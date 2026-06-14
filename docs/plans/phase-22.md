# Phase 22 — Settings → Voice: TTS voice picker

> Closes the §7.3 "Settings → Voice ... TTS voice picker" item. The operator can now
> choose which voice ZIBBY speaks in; the choice persists and `useSpeech` honours it.

## Why this is the phase (gap analysis, 2026-06-14)

Verified the prior candidate (pipeline edit/duplicate, roadmap 2.2 "stubs") against
real code FIRST — it is **already fully wired** (`useUpdatePipelineMutation` +
`useDuplicatePipelineMutation` + edit modal + duplicate button). The roadmap text was
stale (same lesson as Phase 21's "global search already done").

The light theme is a **trap**: the token palette exists, but bespoke surfaces
(`VoiceScreen`, `LoadingScreen`) hardcode dark colours, so a toggle would expose
broken screens — out of scope without a full colour audit.

The genuine remaining unbuilt, listed, low-risk capability is the **Settings → Voice
TTS voice picker** (§7.2/7.3). Voice config exposed only the shortcut; choosing
ZIBBY's voice is a real butler personalization that uses the delivered `useSpeech`.

## Deliverables

1. `features/voice/voicePreference.ts` — localStorage-backed preferred `voiceURI`
   (device-specific, never serialized to the server), SSR-safe; `""`/`null` = auto.
2. `useSpeech.speak` — prefer the chosen voice when available, else `selectVoice`
   (the locale match). Read at speak-time so a Settings change is live.
3. `features/settings/components/VoiceVoiceSetting.tsx` — a self-contained DS
   `Dropdown` of `speechSynthesis` voices + a "Test" button (speaks a sample);
   degrades to a note when TTS is unsupported. Rendered in the Settings preferences
   panel via `SettingRow`.
4. i18n `settings.voice{Voice,VoiceHint,VoiceAuto,VoiceUnsupported}`, `voiceTest`,
   `voiceTestSample` (cs + en).

## Tests (added this phase)

- `voicePreference.test.ts`: default null (auto), round-trip a voiceURI, clear on
  null/empty.
- `useSpeech.test.tsx` (+2): a preferred voice overrides the locale match; an
  unavailable preference falls back to the locale voice.
- `VoiceVoiceSetting.test.tsx`: selecting a voice persists it; the Test button
  speaks the sample; unsupported TTS renders the note (no controls).
- Test seam: `vitest.setup.tsx` installs an in-memory `localStorage` — Node 25's
  experimental global Storage throws without `--localstorage-file`, shadowing jsdom's.
  Production is unaffected (real browser, and the code SSR-guards `window`).

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest
green → full `pnpm test` green → `graphify update .`. Checkpoint commit (no push).

## Out of scope (→ next)

- Wake word (`@picovoice/porcupine-web` — free tier + AccessKey + license phone-home;
  or `@ricky0123/vad-web` — MIT, VAD-only). Optional, dependency-heavy.
- live/demo voice-mode toggle + mute persistence (minor config completion).
- **Functional North-Star gaps are essentially exhausted** — the next iterations
  should shift to priority-2 DESIGN/UX polish of the velín, or priority-3
  simplification, per LOOP.md.
