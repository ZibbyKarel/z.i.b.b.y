# Phase 43 — "Zastavit běh" actually stops a running task (all stoppable kinds)

> TODO (line 65): _"stránka běhy a aktivita - tlačítko 'Zastavit běh' na běžícím tasku
> nic nedělá. Z potvrzovacího dialogu se neodešle žádný request na backend."_

## Root cause

`apps/web/features/runs/Screen.tsx:141-143`:
```ts
const stop = (runId: string, kind: string) => {
  if (kind === "agent") stopAgent.mutate({ params: { runId }, body: {} });
};
```
`stop` only handles `kind === "agent"`. For a running **pipeline** (or **goal**) task the
confirm dialog fires `onStop()` → `stop()` → **no branch matches → no request is sent**.
The contract only has `stopTaskRun` for agent runs
(`libs/contracts/src/tasks/task-runs.contract.ts:87` — "only agent runs can be stopped").
So a running non-agent task's Stop button is a dead button.

## Goal

Make "Zastavit běh" actually stop a running task for every kind that has a running
process — agent AND pipeline AND goal (whatever the unified run model can actually
interrupt). The confirm dialog must send a real backend request that stops the run.

## Recon (implementer)

- The run kinds in the unified `/tasks/runs` model (agent / pipeline / goal / chain) and
  which of them own a stoppable running process. Read the task-run schema + how each kind's
  run is spawned/tracked in `apps/api/src/tasks/*` (and the runner/process governance —
  memory notes `runShell` pgid/timeout governance, a run registry). Find how the AGENT stop
  currently interrupts its process (`stopTaskRun` handler + service) — that's the mechanism
  to generalize.
- The web mutations: `features/runs/mutations/useStopAgentMutation.ts` (calls
  `apiClient.taskRuns.stopTaskRun`). `Screen.tsx` wires `onStop`/`stopping` into `RunDetail`.

## Approach

Prefer generalizing the existing stop rather than adding N endpoints:
1. **Contract/API**: broaden `stopTaskRun` (`/tasks/runs/:runId/stop`) to stop any running
   task run — resolve the run's kind server-side and interrupt its process (kill the child /
   signal the pgid, mark the run stopped/`interrupted`, flush logs), reusing the agent-stop
   path's process-governance. If a kind genuinely can't be stopped, return a clear
   result/error the UI can show — but pipeline + goal runs (which spawn a `claude`/child
   process) SHOULD be stoppable. Update the contract summary (drop "only agent runs").
   Add/extend e2e: start a pipeline/goal run (demo mode), stop it, assert it transitions to
   stopped/interrupted and the process is reaped.
2. **Web**: extend `Screen.tsx` `stop()` to call the stop mutation for agent, pipeline, AND
   goal kinds (a running run of any stoppable kind); make `stopping` reflect the pending
   state across them. Keep the ConfirmDeleteDialog flow (`RunDetail` already calls `onStop`
   on confirm — that part is correct). If some kind is not stoppable, hide/disable the Stop
   button for it (don't show a dead button) — but the primary outcome is stop WORKS for
   running agent/pipeline/goal tasks.

## Files (expected)
- `libs/contracts/src/tasks/task-runs.contract.ts` (+ schema if the stop body/response changes)
- `apps/api/src/tasks/*` (task-runs controller + service — generalize stop; process kill)
- `apps/api/test/tasks.e2e.test.ts` (stop a pipeline/goal run)
- `apps/web/features/runs/Screen.tsx` (`stop()` handles all stoppable kinds; `stopping`)
- possibly a `useStopPipelineRunMutation` / generalize `useStopAgentMutation` (rename or add)

## Verification
- `pnpm typecheck`, scoped lint, `pnpm test` (web) + `pnpm api:test` green modulo known
  pre-existing failures (confirm via `git stash`; the 2 machine.service.ts errors are
  operator WIP; apps/api pipelines.e2e has pre-existing flakes — don't chase).
- Manual/behavioral: on `/runs`, click "Zastavit běh" on a running agent run AND a running
  pipeline run → confirm → a request hits the backend and the run stops (status →
  stopped/interrupted); the button is not shown for non-stoppable runs.

## Constraints
- No forwardRef, no `any`, contract-first. Respect the run-process governance already in the
  api (pgid/timeout/registry) — reuse it, don't fork a new kill path. Don't touch operator
  WIP (SummaryWidget, machine.*, design/*).
