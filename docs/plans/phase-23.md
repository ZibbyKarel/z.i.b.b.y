# Phase 23 — Conversational voice dispatch (North-Star realignment)

> The operator rewrote `apps/api/data/vault/north-star.md` (2026-06-14) to make
> **Voice a co-equal, conversational surface**: "no command grammar to learn and no
> 'new task' form to confirm — when ZIBBY understands the intent, it dispatches to the
> same `/tasks` layer the HUD drives, on its own, and tells you it has while the work
> runs." This phase delivers the first slice of that realignment.

## Why this phase (gap analysis against real code)

The current voice path (Phases 17–22) makes the mic real, the grammar act on gate/
control commands, and ZIBBY speak back — but a **plain spoken task** still routes
through `VoiceScreen.handOff` → `useNewTask().open(text)` → **`NewTaskDialog`**, a confirm
modal. The new North Star explicitly forbids this: confirming *that ZIBBY understood you*
is the conversation's job and **is never a modal**; only a *transactional/destructive*
action stops — at the **gate**, never skipped.

So the one structural conflict to close first is **#2 from `project_northstar_voice_shift`**:
the composer-confirm seam. Replace stage-to-modal with **dispatch-and-narrate**.

Deliberately *not* in this slice (kept small, per LOOP.md):

- Ripping out `parseUtterance`'s command grammar. Gate answers (approve/reject) are the
  **spoken gate**, which the North Star explicitly endorses; stop/navigate/close are
  control affordances a later "Claude behind the channel" phase subsumes. Touching them
  now is scope creep with no North-Star payoff this iteration.
- Loop/goal synthesis from voice (the dialog's `createGoal`+`startGoal` branch). A bare
  `createTask({text})` dispatches a single task via the backend classifier; loops stay a
  HUD/advanced affordance until a turn-by-turn voice phase.
- Live run-event *streaming* narration. We narrate the dispatch (`dispatching` → `started`);
  per-step run narration is a later phase.

## Deliverables

1. **`features/voice/runVoiceAction.ts`**
   - `VoiceAck.values` widened: `{ page?: NavPage; task?: string }`.
   - Ack keys add `dispatching`, `started`, `dispatchFailed`; `heard` retained for the
     empty-utterance no-op.
   - Dep `stageTask` → `dispatchTask: (text: string) => void`.
   - `createTask` branch: empty `text` → `{ key: "heard" }` (no dispatch); else
     `deps.dispatchTask(text)` + `{ key: "dispatching", values: { task: text } }`.

2. **`features/voice/hooks/useUtteranceDispatch.ts`**
   - Drop `onStageTask`; keep `onExit` (navigate/close still need it).
   - Add `useCreateTaskMutation`. `dispatchTask(text)`: `paths = extractPaths(text)`,
     `createTask.mutate({ body: { text, paths } }, { onSuccess → setAck({key:"started"}),
     onError → setAck({key:"dispatchFailed"}) })`. **No `router.push`** — stay in overlay.

3. **`features/voice/components/VoiceScreen.tsx`**
   - Remove `useNewTask`/`openNewTask`/`handOff`.
   - `useUtteranceDispatch({ approvals, liveRuns, onExit })` (no `onStageTask`).
   - Manual button repurposed to **Send**: `dispatch(lastUserUtterance)` directly (keeps
     demo mode able to dispatch deterministically); no `onExit`.
   - TTS effect + visual ack render pass `ack.values` to `t()` so `dispatching` interpolates
     the understood `{task}`.

4. **i18n** (`cs.json` + `en.json`)
   - `voice.ack.dispatching` (with `{task}`), `voice.ack.started`, `voice.ack.dispatchFailed`.
   - `voice.send` replaces the `voice.handToTask` label (button semantics changed).

## Tests (added/updated this phase)

- **`runVoiceAction.test.ts`**: `dispatchTask` replaces `stageTask`; plain speech →
  `{ key: "dispatching", values: { task } }` + `dispatchTask(text)` called; empty text →
  `{ key: "heard" }`, `dispatchTask` **not** called.
- **`useUtteranceDispatch.test.tsx`** (new): mock `../../tasks/mutations`,
  `../../approvals/mutations`, `../../runs/mutations`, `next/navigation`. `dispatch("build
  me a login page")` → `createTask.mutate` called with `{ body: { text, paths: [] } }`; ack
  is `dispatching` then `started` after `onSuccess`; an `onError` path yields
  `dispatchFailed`; a recognised command (e.g. `"schválit"` with a pending approval) does
  **not** call `createTask`; `router.push` is never called by the task path.
- **`VoiceScreen.test.tsx`**: drop the `useNewTask` mock + `openSpy`. "dispatches a
  finalized live utterance" stays. New: the **Send** button calls `dispatch` with the
  transcript and does **not** call `onExit`; Send disabled until something is spoken; the
  screen speaks the `dispatching` ack (with the echoed task) via the speech mock.

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest green →
full `pnpm test` green → `graphify update .`. Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next)

- **Phase 24** candidate: turn-by-turn clarification — when the classifier is low-confidence,
  ZIBBY asks a spoken follow-up instead of dispatching blind (still no modal).
- Live run-event narration streaming (RunEvents → spoken progress).
- Voice-driven loop/goal synthesis.
