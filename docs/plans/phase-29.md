# Phase 29 — Goal detail: pipeline-maker iteration opens its stage timeline

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** — "always answerable." Closes the
> maker-fold arc 26 → 27 → 28 → 29.

## Problem

Phase 26 folded a loop's child maker/verifier runs out of the `/runs` feed. Phase 27
made the goal detail open the **agent** maker log + claude verifier log, but left the
**pipeline** maker showing only a note ("its stage logs live in the pipeline view").
Phase 28 then built that view (`PipelineStageTimeline`). Phase 29 joins 27 + 28: a
goal iteration whose maker ran as a pipeline should reveal that maker run's **stage
timeline** inline — so every folded child execution is answerable from the task detail.

The child pipeline run id is `iteration.makerRunRef`; its `stageRuns` aren't on the
iteration, so the goal panel fetches the maker run aggregate.

## Implementation

### 1. `PipelineStageTimeline` — id-driven props
`apps/web/features/runs/components/PipelineStageTimeline.tsx` — props change from
`{ run: RunView }` to `{ pipelineRunId: string; owner: string; stageRuns: RunView["stageRuns"] }`
(`owner` = pipeline definition id, for the "open pipeline" link). Hide the definition
link when `owner` is empty (a goal maker run aggregate still loading → no broken
`/pipelines/` link). Update the `RunDetail` caller:
`pipelineRunId={run.runId} owner={run.owner} stageRuns={run.stageRuns}`.

### 2. `GoalDetailPanel` — fetch the open maker run, render the timeline
`apps/web/features/runs/components/GoalDetailPanel.tsx`:
- Since only one iteration's log is open at a time, fetch only the **open** row's maker
  run: `const openIter = iterations.find(it => it.index === openLog)`,
  `const openMakerPipelineId = openIter?.makerKind === "pipeline" ? openIter.makerRunRef ?? null : null`,
  `const { data: makerPipeline } = usePipelineRunQuery(openMakerPipelineId)` (one hook
  call; `enabled`-gated on a non-null id → no fetch for agent makers).
- In the open disclosure's pipeline branch, replace the note with
  `makerPipeline ? <PipelineStageTimeline pipelineRunId={makerRunRef} owner={makerPipeline.pipelineId} stageRuns={makerPipeline.stageRuns} /> : <stageLoading note>`.

### 3. i18n
Drop the now-dead `runs.goalPipelineMakerNote`; add `runs.stageLoading` (cs+en).

## Tests
- `PipelineStageTimeline.test.tsx` — retarget to the new props; add "definition link
  hidden when owner unknown (empty)".
- `GoalDetailPanel.test.tsx` — rewrite the Phase-27 pipeline-note test: a pipeline-maker
  iteration, when expanded, fetches the maker run (mock `usePipelineRunQuery`) and renders
  the stage timeline (stub `./PipelineStageTimeline`, assert the maker run id + pipeline id
  are wired in); no agent-log stream mounted.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green (web/DS; api unchanged — under-load e2e
  flake verified by `vitest --project api` 691/691 isolated); `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
