# Phase 126d — a roadmap-picked task shows no project

> TODO.md item 4: _"pickupnutý task z roadmapy nemá přiřazený projekt"_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

**This plan was written after the investigation, not before it.** The root cause was not
knowable from the report, and the first recon returned a confident wrong answer. Recording
the path here so the next reader inherits the reasoning rather than repeating it.

---

## The wrong answer, and why it was tempting

The first recon concluded: `RoadmapDecompositionService.dispatch()` passes no
`trustedProjectId` and leans on `paths` + `matchProject`, which cannot match a project whose
stored `path` is unset (legitimate since Phase 98) — so the task lands unattributed.

That is wrong twice over:

1. `RoadmapGateService.release()` — the path an actual **pickup** takes — has passed
   `project.id` as `trustedProjectId` all along, with a long comment explaining exactly this
   hazard. Manual play, bulk play, auto-pickup, routed release and restart all funnel through
   it.
2. Decomposition does have the described weakness, but it **throws** on `!project.path`
   rather than creating an unattributed task. It fails loud, so it cannot produce the
   reported symptom.

Both were verified against real data: `.zibby/data/projects/_projects.json` ids match the
`projectId` values in `.zibby/data/roadmap/shoptet-partner-cli/*.json` exactly — no slug vs
opaque-id mismatch, and `ProjectsStorageService.get` resolves them.

Every persistence branch in `TaskSchedulerService` / `ScheduledTasksStorageService`
(`create`, `createHeld`, `createPending`, `createQueued`, `createDeferredLimit`,
`createDispatched`, `markDispatched`, `markHeld`, `markQueued`) was read individually. All of
them thread `projectId` correctly.

**The task was never missing its project. The API was right end to end.**

## The actual defect

`TaskRunsService` assembles the unified run feed from four run-kind view builders. Three —
`agentRunToView`, `pipelineRunToView`, `goalRunToView` — are wrapped in
`resolveProjectDisplay(...)`, which turns the joined `projectId` into a display **name**. The
fourth, `scheduledTaskToView`, was not, and hardcodes `project: ""`.

`scheduledTaskToView` is the builder used while a task is still `held` / `queued` /
`pending` / `scheduled` — i.e. **before** it dispatches into an agent or pipeline run.

The web reads the name, not the id:
- `TaskCard.tsx:70` builds the card footer from `run.project` and drops empty strings with
  `.filter(Boolean)`.
- `RunDetail.tsx` gates the project meta cell on `run.projectId` but renders
  `value={run.project}` — so the chip appears with a blank label.

So: a roadmap pickup that parks behind the budget or concurrency cap — which is the common
case, `maxConcurrentRuns` defaults to 3 — displays as project-less until it dispatches. That
is precisely the reported symptom, and it explains why the attribution code all looked fine.

## The fix

One call site in `apps/api/src/tasks/task-runs.service.ts`: wrap `scheduledTaskToView`'s
output in `resolveProjectDisplay`, making all four builders symmetric.

```ts
...scheduled.flatMap((t) => {
  const view = scheduledTaskToView(t);
  return view ? [resolveProjectDisplay(view, projectNames)] : [];
}),
```

There is exactly one `scheduledTaskToView` call site, and `listTaskRuns` and `getTaskRun`
both build from it, so feed and detail are fixed together.

## Tests

`apps/api/src/tasks/task-runs.service.test.ts` — two cases, red before the fix:

```
expected '' to be 'Acme Corp'   (queued scheduled task)
expected '' to be 'Acme Corp'   (held scheduled task)
```

`run.projectId` was already `"acme"` in both; only the label was empty. That asymmetry is the
whole bug, and the test asserts on the label specifically so a future refactor cannot satisfy
it by checking the id.

## Left open, deliberately

**`RoadmapDecompositionService.dispatch()` is still inconsistent with `release()`.** It omits
`trustedProjectId` and requires a literal `project.path`, throwing otherwise — so epic
decomposition cannot run at all for a Phase-98-style project with no stored path. Two of the
six registered projects (`cms4`, `shoptet-partner-cli`) are in exactly that state.

This is a real defect, but it is **not** the one reported: it refuses to create the task
rather than creating a project-less one. Fixing it means passing `project.id` through as
`trustedProjectId` the way `release()` does and deleting the path guard. Out of scope here;
it deserves its own commit and its own test.

**Not confirmed against production evidence.** The historical task JSON files referenced by
the real roadmap items (`task_1785334372051_b3582c`, …) no longer exist on disk, so the fix
is proven by the code path and a targeted regression test rather than by replaying a stored
failure.

## Definition of done

1. Both new tests red before, green after.
2. `apps/api/src/tasks` + `apps/api/src/roadmap` green (450 tests).
3. Prettier + ESLint clean; both tsc projects clean.
4. One commit: `fix(runs): resolve the project display name for parked scheduled tasks`.
