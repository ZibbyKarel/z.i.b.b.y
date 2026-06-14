# Phase 28 — Pipeline run detail: stage timeline + per-stage logs

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** ("always answerable" for pipeline
> runs) + **#3 simplification** (dedupe the paused-limit notice). Sibling of Phase 27.

## Problem

A pipeline run selected in `/runs` rendered, in `RunDetail`, only a one-line note plus
an **"open pipeline"** button that navigated to the pipeline **definition**
(`/pipelines/{pipelineId}`) — the template, not what *this run* did. Its stages, their
statuses, retries, and logs were unreachable from the HUD (the parked panel showed only
the *failing* phase's tail). North-Star law: _"Always answerable."_

The data is already on the run object: `PipelineRun.stageRuns[]` =
`{ phaseId, runId, attempt, status }` (schema doc: _"so its log is pollable per phase"_),
and the endpoint `GET /api/pipelines/runs/:id/stages/:phaseId/logs` + `useStageRunLogQuery`
already exist (used by `RunParkedPanel`).

## Implementation

### 1. `RunView` carries the stages
`apps/web/features/runs/run.ts` — add `stageRuns?: PipelineRun["stageRuns"]`; set it in
`pipelineRunToView` (`stageRuns: r.stageRuns`).

### 2. `PipelineStageTimeline` (new component)
`apps/web/features/runs/components/PipelineStageTimeline.tsx` — mirrors
`GoalDetailPanel`'s iteration timeline:
- One row per `stageRun`: `phaseId`, `attempt` (shown only when > 1), and a
  `RunStateBadge` (reuse — every `StageRunStatus` is a `FeedStatus`, so `RUN_STATE`
  already has the glyph/tone).
- A "log" toggle per row; `const [openLog, setOpenLog] = useState<string|null>` keyed by
  `"${phaseId}#${attempt}"` → single open ⇒ at most one stage-log query live.
- `StageLog` subcomponent (mounted only while open): `useStageRunLogQuery(runId, phaseId)`
  → `CodeBlock` (or a "no log yet" note; a pending note while fetching).
- Footer: keep the **"open pipeline"** link to the definition (`/pipelines/{owner}`).
- Empty `stageRuns` → an empty-state line + the definition link.

### 3. `RunDetail` wiring + simplification
`apps/web/features/runs/components/RunDetail.tsx`:
- New `kind === "pipeline"` branch: the paused-limit / retries-parked notice (when
  applicable) above `<PipelineStageTimeline run={run} />`. Removes the old parked-pipeline
  branch and the "note + link" placeholder.
- Extract `LimitPausedPanel` (was three inline copies: agent / pipeline / goal) — shows
  the reset ETA + optional resume-cycle count.
- Drop the now-dead `pipelineNote` log branch and the unused `useRouter` import.

### 4. i18n
`apps/web/i18n/messages/{cs,en}.json` under `runs`: `stageTimeline`, `stageAttempt` (`{n}`),
`stageNoLog`, `stageNone`. Reuse `goalOpenLog` ("log") + `openPipeline`.

## Tests
- `PipelineStageTimeline.test.tsx` (mock `next/navigation` `useRouter` + `useStageRunLogQuery`):
  one row per stage incl. retried `attempt`; no stage log fetched until expanded; expanding
  opens that phase's log by `phaseId`; single-open invariant (opening B collapses A);
  footer links to `/pipelines/{owner}`; empty-stages empty-state.
- `run.test.ts`: `pipelineRunToView` carries `stageRuns`.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `npx tsc -p apps/web/tsconfig.json --noEmit`
  clean; `graphify update .`; checkpoint commit (no push — PR is the gate).

## Unlocks
Phase 27's deferred pipeline-maker case — a goal's pipeline maker child can reuse this
stage view from the goal detail.
