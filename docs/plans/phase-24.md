# Phase 24 — Voice status is pull, not push (operator feedback)

> Operator, mid-loop (2026-06-14): _"Logy běhu hlásit nechci ve voice UI. Co se děje bych
> měl dostat jen v případě že se zeptám. Dát prostě briefing místo čtení logů."_ →
> **Voice must not push run logs/status. "What's happening" is given only when the operator
> asks — as a briefing, never by reading logs.**

## Why this phase (gap analysis)

This is direct feedback that **redirects** the previously-proposed Phase 24 ("live run-event
narration"). It refines North-Star conflict #3 ("narrating as it goes"): narration means the
**high-level dispatch acks** Phase 23 already speaks ("starting that", "it's running") — confirming
*the operator's own command* — NOT a play-by-play of a run's internal events. Unsolicited status is
unwanted; the butler stays quiet and, when **asked**, summarizes (the briefing). This matches
CLAUDE.md's "quiet competence — notify only when genuinely relevant."

Two concrete consequences in the current code:

1. **Phase 20's auto-announce of runs finishing while voice is open** (`VoiceScreen`'s
   `pickNewlyFinished` effect) is an *unasked* status push → **remove it**.
2. **There is no way to ask for status by voice** — only the "Brief me" button. "Jen když se
   zeptám" in a voice surface implies asking *by voice* → add a spoken briefing question.

Explicitly **not** built: live run-event/log narration (the original Phase 24 — killed by this
feedback).

## Deliverables

1. **`features/voice/briefing.ts`** — delete `pickNewlyFinished` + `FinishedRun` + the `FINISHED`
   set (dead once the push is gone). `summarizeBriefing` (the pull summary) stays.
2. **`features/voice/components/VoiceScreen.tsx`** — remove the announce-finishing `useEffect`
   (+ the `announced` ref + the `pickNewlyFinished` import). Reorder so `useSpeech` + the briefing
   callbacks sit above `useUtteranceDispatch` (it now receives an `onBrief`). The TTS auto-speak
   effect skips the `briefing` ack (the briefing was already spoken by `brief()`).
3. **`features/voice/parseUtterance.ts`** — new `VoiceAction` `{ kind: "briefing" }`, matched
   against a normalized cs/en phrase set ("co se děje", "co je nového", "status", "briefing",
   "shrnutí", "what's happening", "what's up", "brief me", "give me a briefing"…), checked after
   navigate and before the bare commands. A longer utterance ("co se děje s buildem") does **not**
   match (exact-phrase set) → stays a dispatched task.
4. **`features/voice/runVoiceAction.ts`** — `brief: () => void` dep; `case "briefing"` calls
   `deps.brief()` and returns `{ key: "briefing" }`. New ack key `briefing`.
5. **`features/voice/hooks/useUtteranceDispatch.ts`** — `onBrief: () => void` option, wired as
   the `brief` dep.
6. **i18n** `voice.ack.briefing` (cs "Briefing." / en "Briefing.") — a visual-only label; its TTS
   is suppressed (the spoken briefing is the summary itself).

## Tests (added/updated this phase)

- **`parseUtterance.test.ts`**: each briefing phrase (cs+en) → `{ kind: "briefing" }`; a longer
  "co se děje s buildem auth" → `createTask` (not briefing).
- **`runVoiceAction.test.ts`**: `briefing` action calls `deps.brief()` and returns `{ key:
  "briefing" }`.
- **`useUtteranceDispatch.test.tsx`**: a spoken "co se děje" calls `onBrief` and does **not** call
  `createTask`; ack is `briefing`.
- **`briefing.test.ts`**: drop the `pickNewlyFinished` describe (function removed).
- **`VoiceScreen.test.tsx`**: replace "announces a run that finishes" with "does **not**
  auto-announce a finishing run" (the push is gone); "Brief me" still speaks on demand.

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest green → full
`pnpm test` green → `graphify update .`. Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next)

- **Phase 25: turn-by-turn clarification** — low-confidence classify → a spoken follow-up question
  instead of dispatching blind (still no modal), "resolved in the dialogue itself, turn by turn".
- Richer briefing content (per-engagement grouping) once multi-engagement (Phase 8) lands.
