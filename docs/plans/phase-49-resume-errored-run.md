# Phase 49 — "Resume" an errored task run (prefer context-preserving `--resume`)

> TODO (line 77): _"stránka běhy a aktivita - na detailu tasku, který skončil chybou mi
> chybí tlačítko 'resume', které pustí task znova (ideálně tak aby se nemusel znovu celý
> opakovat a načítat context)."_

## Current state (recon done)

- There IS a resume already, but only for PARKED runs: contract route
  `POST /tasks/runs/:runId/resume` (`libs/contracts/src/tasks/task-runs.contract.ts:103`,
  body `ResumeTaskRunSchema` = an operator note). `TaskRunsService.resume`
  (`apps/api/src/tasks/task-runs.service.ts:184`) delegates to
  `pipelineRunner.resumeParked` / `goalRunner.resumeParked`; **agent runs throw
  "cannot be resumed"** (`task-runs.service.ts:48`). This is resume-from-parked, NOT
  re-run-after-error.
- `RunnerCore.resume` respawns a paused/held/limit-paused run from a STASHED spec — it does
  not re-run a terminally-errored run, and there is no captured claude `session_id` on agent
  task runs (session-id parsing exists only in the CHAT path:
  `apps/api/src/chat/chat-stream-parser.ts` reads `{"type":"system","subtype":"init","session_id"}`).
- `TaskRunSchema` (`libs/contracts/src/tasks/task-run.schema.ts:73`) has no `sessionId` field.
- Terminal error state: memory notes the terminal failure status is `error` (also `interrupted`).

## Goal

On the detail of a run that ended in **error** (and reasonably `interrupted`), show a
**Resume / Spustit znovu** button that re-runs the task. IDEALLY resume the same claude
session (`--resume <sessionId>`) so context isn't reloaded; if session capture isn't feasible
without disproportionate runner surgery, fall back to re-running the task fresh — but DELIVER a
working resume button either way, and be honest in the UI label + report about which semantics
shipped.

## Recon the implementer MUST do first

1. How an AGENT task run is spawned: trace `TaskRunsService` → the agent runner (`RunnerCore` +
   the task agent runner/spec builder in `apps/api/src/tasks/*` and `apps/api/src/runner/*`).
   Determine the `claude` args used (`--output-format`? `--include-partial-messages`? stream-json?)
   and whether the run's stdout stream is already parsed line-by-line (logs are). If the stream is
   stream-json (or can be), the `system/init` line carries `session_id` — capturing it is cheap
   (mirror `chat-stream-parser.ts`).
2. Whether pipeline/goal runs could also be "re-run after error" — but SCOPE THIS PHASE to AGENT
   runs first (the simplest, most common errored task); if pipeline/goal error-resume is trivial to
   include, do it, else list as follow-up.

## Approach (contract-first; smallest correct build)

**A. Capture the session id (enables true resume).**
- If the agent runner already consumes a stream-json stdout, add parsing of the `init` `session_id`
  (reuse/extract the chat parser's logic) and persist it on the run record. Add
  `sessionId: z.string().optional()` to the run schema + the on-disk run store. If the runner does
  NOT emit stream-json and switching it is risky, SKIP capture and go to the fresh-re-run fallback
  (document it).

**B. Resume/re-run endpoint.**
- Prefer EXTENDING the existing `/tasks/runs/:runId/resume` semantics (or add a sibling
  `/tasks/runs/:runId/rerun`) so an errored/interrupted AGENT run can be resumed: build a new run
  from the original task spec, and if a `sessionId` was captured, spawn `claude` with
  `--resume <sessionId>` (context-preserving); otherwise spawn fresh from the same task prompt/target.
  Reuse the existing spawn/governance path (pgid/timeout/registry) — do NOT fork a new spawn path.
  Update the contract summary ("resume a parked run" → also "re-run an errored agent run").
- Respect the autonomy floor: this is operator-initiated (a button click), so it's allowed like any
  task launch — but keep any PR/output gating the original task had (don't auto-commit/auto-push).

**C. Web UI.**
- On `RunDetail.tsx`, when `run.status === "error"` (and `interrupted`), render a **Resume** button
  (DS `Button icon="run"`, primary) in the header action cluster, next to Delete. Label it per what
  actually ships: if session-continuity resume is wired, "Pokračovat" (resume); if it's a fresh
  re-run, "Spustit znovu". Wire it through a `useResumeRunMutation` (or reuse the existing resume
  mutation) that calls the endpoint, then navigates to / selects the new (or continued) run.
- i18n keys for the button label + any confirm copy (cs default + en).

## Files (expected)
- `libs/contracts/src/tasks/task-run.schema.ts` (+ `.test.ts`) — `sessionId?` if captured; resume/rerun
  input/response if changed.
- `libs/contracts/src/tasks/task-runs.contract.ts` — endpoint/summary.
- `apps/api/src/tasks/task-runs.service.ts` + the agent runner/spec files + run store — capture
  session id (if feasible), resume/re-run an errored agent run.
- `apps/api/src/runner/*` only if session capture / respawn-with-`--resume` needs it (reuse governance).
- `apps/api/test/tasks.e2e.test.ts` (or the relevant e2e) — re-run an errored agent run (demo mode:
  `AGENT_RUNNER_MODE=demo`), assert a new/continued run starts.
- `apps/web/features/runs/components/RunDetail.tsx` — Resume button on errored runs.
- `apps/web/features/runs/mutations/` — resume/rerun mutation (+ index).
- `apps/web/features/runs/Screen.tsx` — wire the button + post-resume navigation/selection.
- i18n `apps/web/i18n/messages/{cs,en}.json`.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean; API typecheck clean (the 2 machine.service.ts
  errors are operator WIP — ignore).
- Scoped lint per touched dir (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/runs` green (pre-existing reds confirmed via `git stash`).
- `pnpm api:test` for the tasks e2e (apps/api pipelines.e2e has pre-existing flakes — don't chase).
- Manual: a run that ended in error shows a Resume button; clicking it starts a new/continued run;
  with a captured session id it resumes context (`--resume`), else re-runs fresh.

## Constraints
- Contract-first, no forwardRef, no `any`, respect run-process governance (reuse, don't fork a kill/
  spawn path). Approval floor intact — operator-initiated re-run keeps the original task's output gate.
- Don't touch operator WIP (SummaryWidget, `apps/api/src/machine/*`, `libs/contracts/src/machine/*`,
  `design/*`, `apps/web/features/chat/**`). If true session-continuity resume can't be built without
  large/risky runner changes, ship the fresh-re-run button and clearly document the follow-up in the
  report — do NOT leave a dead button.
