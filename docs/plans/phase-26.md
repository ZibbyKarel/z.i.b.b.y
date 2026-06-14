# Phase 26 — HUD runs feed: one card per task (fold a loop's child runs)

> Operator (2026-06-14): _stop Voice (nice-to-have), polish the HUD — real bugs remain._ First
> bug: a running **loop** shows two cards in **Běhy a aktivita** (`/runs`) — the loop **and** the
> agent it is currently running. The feed must show **one card per task**; the execution kind
> (agent/pipeline/loop) belongs **inside the task detail**, not as a second card.
> ([[feedback_focus_hud_not_voice]])

## Why this phase (root cause)

`apps/web/features/runs/queries/useRunsQuery.ts` builds the feed by merging three per-kind
*full-history* lists — agent runs + pipeline runs + goal runs — **with no dedup** (lines 96–107).
A goal (loop) dispatches its maker as a **child** agent or pipeline run and records its id in
`iteration.makerRunRef` (and the claude verifier's run in `verifier.runRef`). Because the child run
is registered in its own service and returned by its own `listRuns`, it surfaces as a **peer feed
card** alongside the goal — the double card the operator sees.

The parent→child link already exists (`GoalRun.iterations[].makerRunRef` / `verifier.runRef`); the
child has no back-link. So the fold is naturally done on the client where all lists meet: drop any
agent/pipeline run whose id is a goal child.

## Deliverables

1. **`features/runs/run.ts` — `mergeRunFeed(agents, pipelines, goals, scheduled)` (pure)**: move the
   inline merge out of the hook and add the fold —
   - collect `childRunIds` = every `iteration.makerRunRef` and `iteration.verifier.runRef` across all
     goals;
   - filter agent runs (`!childRunIds.has(r.runId)`) and pipeline runs
     (`!childRunIds.has(r.pipelineRunId)`);
   - map + `enrichRunWithTask`, append goal views and `scheduledTaskToView`, sort newest-first.
2. **`features/runs/queries/useRunsQuery.ts`**: the `useMemo` calls `mergeRunFeed` (same deps).
3. **`features/runs/components/GoalDetailPanel.tsx`**: each iteration row shows its **maker kind**
   (an agent/pipeline glyph + label) — the execution kind now lives in the task detail.
4. **i18n** `runs.goalMakerKind.{agent,pipeline}` (cs+en).

## Tests (added/updated this phase)

- **`run.test.ts`** — `mergeRunFeed`:
  - a goal whose `iteration.makerRunRef` is an agent run id → the feed has the goal card, **not** the
    child agent card;
  - the same for a pipeline maker child;
  - a goal whose `verifier.runRef` is an agent run id → that verifier run folded too;
  - a standalone agent run (not any goal's child) **stays** in the feed;
  - result sorted newest-first.
- **`GoalDetailPanel.test.tsx`** — an iteration timeline shows the maker-kind label (e.g. "pipeline").

## Definition of done

`pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` → web-components vitest green → full
`pnpm test` green → `graphify update .`. Checkpoint commit (no push — the PR is the gate).

## Out of scope (→ next HUD bug/polish)

- A "view maker run log" link from a goal iteration into the folded child's log (nice follow-up;
  the child is reachable by id via the agent/pipeline detail endpoints).
- Backend `parentGoalRunId` on child runs + server-side filtering (cleaner long-term, but a contract
  change; the client fold is sufficient and lower-risk).
- Next HUD targets: continue the operator's "polish the velín" pass — audit other feed/detail
  states for similar double-counting or raw-data leaks.
