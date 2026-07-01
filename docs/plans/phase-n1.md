# Phase N1 — DNA Alignment: SSE audit + explicit-target override

> ROADMAP delta phase N1. Oracle: CLAUDE.md + `.zibby/data/vault/north-star.md`.
> Goal: the code and the oracle agree on the two resolved DNA statements —
> **SSE for live streams, polling for state** and **explicit target overrides the classifier**.

## Ground truth (verified against code 2026-07-01)

### Explicit-target override — ALREADY IMPLEMENTED, missing its named test

- `apps/web/features/tasks/hooks/useTaskSubmit.ts:102` — an explicit pick sends
  `target` on the wire; auto omits it.
- `apps/api/src/tasks/task-scheduler.service.ts:716` — `dispatch()` with
  `explicitTarget` never calls `classifier.classify`.
- The ROADMAP's claim "classifier still runs" refers only to the **side-effect-free
  preview** classify that populates the picker — that is by design, not a dispatch.
- **Gap:** ROADMAP names the test "dispatch-with-target skips classifier (assert
  classifier not invoked)" — it does not exist in `task-scheduler.service.test.ts`.

### SSE audit — violations found

| Surface | Today | Verdict |
| --- | --- | --- |
| health, limits | poll | ✅ allowed by DNA |
| runs / running agents / pipeline runs | poll only when SSE disconnected | ✅ compliant pattern |
| activity feed, run events, run logs, chat | SSE | ✅ |
| `useStageRunLogQuery` (live stage log) | **unconditional 1s poll** | ❌ a log IS the canonical stream |
| `useApprovalsQuery` | **unconditional 1m poll** | ❌ SSE invalidation exists but incomplete |
| `useBudgetQuery` | **unconditional poll** | ❌ SSE already invalidates it on every run transition |
| `RunEventsProvider` activity scope | doesn't invalidate approvals on `approval-*` activity | gap (a task held on budget emits `approval-requested` activity only) |

## Build

1. **API — stage-log SSE endpoint** (mirror of the existing run-log stream):
   - `PipelineRunnerService.onStageLogAppend(pipelineRunId, phaseId, listener)` —
     resolve the tailed attempt exactly like `readStageLog` (live phase →
     `currentStageRunId`, else last `stageRuns` match), subscribe via `core.onLog`.
   - `TaskRunsService.onStageLogAppend(...)` passthrough (kind-checked like `getStageLog`).
   - `TaskRunLogsController`: add `@Sse("api/tasks/runs/:runId/stages/:phaseId/logs/stream")`
     reusing `streamRunLog` + `readStageLog`. Unknown run/phase → done chunk, no error loop.
2. **Web — stage log stream**:
   - Extract the EventSource-with-poll-fallback core of `useRunLogStream` into a
     shared `useLogTail(logsBase | null)`; `useRunLogStream(runId)` keeps its API.
   - New `useStageRunLogStream(pipelineRunId, phaseId | null)` over the stage path.
   - `PipelineStageTimeline` live row uses the stream; terminal rows keep the
     one-shot query (that's state, not a stream). `RunParkedPanel` untouched (one-shot).
3. **Web — polling discipline**:
   - `useApprovalsQuery` + `useBudgetQuery`: poll **only when the SSE channel is
     down** (`useRunEventsConnected()`), same pattern as `useRunsQuery`.
   - `RunEventsProvider`: activity scope with `kind` starting `approval-` also
     invalidates the approvals query.
4. **Docs**: mark N1 delivered in ROADMAP with a pointer here.

## Tests (definition of done)

- [x] api `task-scheduler.service.test.ts`: explicit-target dispatch never invokes
      `classifier.classify` and starts the named unit; no-target dispatch still classifies.
- [x] api `pipeline-runner.service.test.ts`: `onStageLogAppend` tails the live attempt
      (`currentStageRunId`) while the phase executes, follows a retry swap, ignores
      unrelated runs; unknown pipeline run never fires.
- [x] api `task-runs.service.test.ts`: stage-log append subscription delegates to the
      pipeline runner (kind check deliberately lives on the read path — see the
      service jsdoc; a non-pipeline id simply never fires).
- [x] web `useStageRunLogStream` (eventSourceMock): streams chunks in order, done
      closes the source, falls back to the offset poll when the source errors
      before open; `useRunLogStream` URL surface unchanged.
- [x] web `RunEventsProvider`: `approval-*` activity invalidates the approvals key;
      non-approval activity does not; `awaiting-approval` run transition still does.
- [x] web `PipelineStageTimeline`: a terminal stage opens the one-shot query (and
      never the stream); the live stage opens the SSE tail (and never the query).
- `useApprovalsQuery` / `useBudgetQuery` gating mirrors the established
  `useRunningAgentsQuery` pattern (`streamConnected ? false : POLL_MS`) — covered
  by the provider test + the pattern's existing usage; no dedicated hook test
  (the ts-rest client hooks have no isolated test precedent in this repo).

## Verification (2026-07-01)

- `pnpm lint` ✅ (one pre-existing unused-var warning in memory/Screen.tsx, untouched)
- `pnpm typecheck` ✅
- `pnpm test`: all unit + web suites green incl. the new tests. **21 API e2e
  failures are PRE-EXISTING on HEAD** — verified by running the same 8 files in a
  clean worktree at HEAD (identical 21 failures): stale e2e asserting the old
  synchronous `createTask` (now background-first `pending`, intentional per the
  controller jsdoc) and the pre-projectId integrations routes. Zero regressions
  from this phase. → next phase: realign the stale e2e suites (bug-fix priority).

## Out of scope

- N2 chaining, N3 monitors, N4 grammar sweep.
- The preview classify in `NewTaskDialog` stays — it is side-effect-free and feeds
  the picker options; dispatch is what must (and does) bypass.
