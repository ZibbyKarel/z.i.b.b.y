# Phase 20 — Spoken butler's briefing + run-outcome announce

> Finishes ROADMAP **§7.2**'s line "voice reads run outcomes and pending approvals
> aloud" — the spoken counterpart of the Phase 6 written briefing. Builds on the
> Phase 19 `useSpeech` TTS and the existing `useVoiceData`.

## Why this is the phase (gap analysis, 2026-06-14)

Voice (the last 🚧 North-Star capability) now listens (17), acts (18) and speaks
acks (19). The remaining §7.2 functional line is the butler *briefing by voice* —
ZIBBY telling the operator, aloud, what's running and what needs them. High
North-Star value ("Always accountable", the butler's briefing), reuses delivered
machinery (`useVoiceData` + `useSpeech`), template-first and deterministic.

## Scope (one iteration)

A pure briefing summarizer + a "Brief me" action that speaks it + an effect that
announces runs finishing while voice is open. **Not** in scope: wake word, Settings
→ Voice, reading full approval detail/diffs aloud.

## Deliverables

1. **`features/voice/briefing.ts`** (pure):
   - `summarizeBriefing(data) → BriefingFacts` — running agents, pending approvals +
     the top one's actor, recent `done`/`error` counts, a `quiet` flag.
   - `pickNewlyFinished(announced, recent) → FinishedRun[]` — terminal runs
     (`done`/`error`) whose ids are not yet announced.
2. **`VoiceScreen.tsx`**:
   - A **"Brief me"** button → speaks the assembled cs/en summary (explicit request,
     so it speaks even when auto-speech is muted; disabled when TTS unsupported).
   - An effect that announces newly-finished runs aloud, seeded from the first feed
     (history on open is not replayed) and gated on mute.
3. **i18n** `voice.briefMe` + `voice.speak.{briefing,topApproval,recent,nothing,
   outcomeDone,outcomeFailed,outcomeMany}` (cs + en).

## Tests (added this phase)

- `briefing.test.ts`: `summarizeBriefing` counts + `topApprovalSkill` + `quiet`;
  `pickNewlyFinished` returns terminal-and-unannounced, ignores running/announced.
- `VoiceScreen.test.tsx`: "Brief me" calls `speak` with a summary containing the
  agent count + top approval; a run that reaches `done` after open is announced
  (`speak("Tester dokončeno.","cs-CZ")`) while a pre-open already-done run is not
  (rerender test). Existing assertions stay green.

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest
green → full `pnpm test` green → `graphify update .`. Checkpoint commit (no push).

## Notes / gotchas

- Terminal failure status on `RunView` is **`error`**, not `failed` (RUN_STATE keys).
- "Latest"/"top" approval = `approvals[0]` (panel display order).
- Auto-announce seeds the announced-set from the first non-empty feed, so only runs
  that *transition* to terminal while voice is open speak — never the history.

## Out of scope (→ remaining voice work)

- Wake word (`@picovoice/porcupine-web` — free tier + AccessKey; or
  `@ricky0123/vad-web` — MIT, VAD only) and a Settings → Voice surface (live/demo
  mode, recognition language, TTS voice picker). Both are the last §7.3 items and
  optional; the core voice loop (listen → command → speak → brief) is complete.
