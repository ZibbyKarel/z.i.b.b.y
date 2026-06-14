# Phase 25 — Turn-by-turn voice clarification

> North Star: _"Voice is a conversation… what you want is resolved in the dialogue itself, turn by
> turn."_ Phase 23 dispatches a spoken task immediately; Phase 25 adds the missing turn for the
> **ambiguous** case — ZIBBY asks before dispatching blind, the operator answers, done. Still no
> modal (confirming understanding is the conversation's job).

## Why this phase (gap analysis)

After Phase 24, voice can: dispatch a clear task (23), answer the gate (18), brief on demand (24).
The remaining conversational gap is the **low-confidence dispatch**: today
`useUtteranceDispatch.dispatchTask` calls `createTask` straight away, so an ambiguous utterance
("udělej to s tím") is routed blind by the backend classifier. The HUD composer handles this with a
live `classify` preview + a manual target picker; voice has no equivalent. Phase 25 gives voice the
**spoken** equivalent: classify first, and if the verdict is weak, ask a follow-up.

This is the last conversational slice achievable for free — "full Claude behind the channel" (open
reasoning over the utterance) needs a backend model call and is deferred; the deterministic Phase-11
classifier is enough to detect ambiguity.

## Design

`useUtteranceDispatch` becomes classify-first for the task path:

```
dispatch(text):
  if pendingClarify ≠ null:                      # 2nd turn — the answer
     combined = `${pendingClarify} ${text}`; pendingClarify = null
     ack = {dispatching, task: combined}; doDispatch(combined)   # bounded: no re-gate
     return ack
  return runVoiceAction(parseUtterance(text), { …, dispatchTask })   # 1st turn

dispatchTask(text):                              # the createTask branch's handler
  classify({text, paths}) →
     low confidence?  pendingClarify = text; ack = {clarify, options: top candidate names}
     else             doDispatch(text)

doDispatch(text):
  createTask({text, paths}) → ack started / dispatchFailed
```

- **Bounded:** a clarification is asked **at most once**; the answer always dispatches. Termination
  guaranteed.
- **Optimistic ack is visual-only:** `dispatching` is reworded "Heard: {task}" and its TTS is
  suppressed (added to the skip set with `briefing`). ZIBBY speaks only the *outcome* — the clarify
  question, "it's running", or the failure — never "starting" then "wait, clarify".
- `runVoiceAction` is unchanged except a new `clarify` ack key + `values.options`. The classify
  decision is async, so it lives in the hook (the pure executor stays synchronous).
- `classifyTask` is read-only (starts no run), so classify-first adds no side effect.

## Deliverables

1. `runVoiceAction.ts` — `VoiceAck.values` += `options?: string`; ack key `clarify` (and
   `clarifyGeneric` for the no-candidates degenerate case).
2. `useUtteranceDispatch.ts` — `useClassifyTaskMutation`, a `pendingClarify` ref, the classify-first
   `dispatchTask` + `doDispatch`, and the pending-answer branch at the top of `dispatch`.
3. `VoiceScreen.tsx` — add `dispatching` to the TTS skip set (now visual-only).
4. i18n — reword `voice.ack.dispatching` → "Heard: {task}"; add `voice.ack.clarify` (`{options}`)
   + `voice.ack.clarifyGeneric` (cs+en).

## Tests (added/updated this phase)

- **`useUtteranceDispatch.test.tsx`**: mock `useClassifyTaskMutation` (default high-confidence so the
  existing dispatch tests still reach `createTask`). New: a low-confidence classify → `clarify` ack
  with the candidate names + **no** `createTask`; the next utterance (the answer) → `createTask` with
  the combined text + ack `started`, and classify is **not** consulted again. Existing high-confidence
  path: classify → `createTask` → `started`. Gate answers still never classify/createTask.
- **`VoiceScreen.test.tsx`**: replace the "speaks the dispatch ack" test (dispatching is now
  visual-only) with "speaks the clarify question aloud".

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest green → full
`pnpm test` green → `graphify update .`. Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next)

- **Full "Claude behind the channel"** — open-ended reasoning over the utterance (a backend model
  call); needs a spend decision, deferred.
- Multi-turn (>1) clarification chains; richer disambiguation (reading the candidates as a numbered
  spoken menu).
