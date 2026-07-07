# Phase 67 — Run header: absolute "spuštěno" time + clickable "projekt" cell

> TODO (lines 19, 21 — two small header tweaks, batched):
> - _"…header - položka »spuštěno« bude vždy naformátovaný datum a čas počátku běhu nikoliv
>   ve formátu »před 80h«."_
> - _"…header - položka »projekt« bude prokliknutelná na detail projektu do kterého je task
>   přiřazen."_

Both are in `apps/web/features/runs/components/RunDetail.tsx`. Build on the committed phase-63/64 state
(the meta strip + MetaCell-with-onClick from phase 63, and the "Vstup" section from phase 64).

## Item A — "spuštěno" is an absolute formatted date+time, not relative

Current: `startedValue` (~line 413–419) uses `relativeTime(run.startedAt, now, ago)` for the started case,
which renders "před 80h". The operator wants the **started** value ("spuštěno" / `metaStarted`) to ALWAYS
be a formatted absolute date+time of the run start.

- For the **started** case, format `run.startedAt` as an absolute local date+time. Reuse the exact pattern
  already used in this file for the approval `requestedAt` cell: `new Date(run.startedAt).toLocaleString("cs")`
  (keep the cs locale to match the surrounding code). Replace the `relativeTime(...)` branch for started.
- Leave the **scheduled** case (`run.status === "scheduled"`, label `metaScheduled` "spustí se") as-is —
  the operator only asked about "spuštěno". The `inMin`/"in Xm/Xh" future formatting for scheduled stays.
- If `relativeTime` / the `ago` helper becomes unused after this, remove them (grep first — they may be
  used elsewhere in the file; `resumeEta`/`formatDuration` from the same import likely stay).
- `now` may become unused for `startedValue` but is still used elsewhere (duration, limit panels) — leave it.

## Item B — "projekt" meta cell links to the project detail

Current: `{run.projectId ? <MetaCell label={t("metaProject")} tone="accent" value={run.project} /> : <AssignProjectControl runId={run.runId} />}` (~line 536–540). When the run HAS a project, make that
MetaCell clickable to `/projects/${run.projectId}` — MetaCell already supports `onClick`/`testId` (added
in phase 63). Navigate via the existing `router` (`useRouter()` already in the component from phase 63):
- `onClick={() => router.push(\`/projects/${run.projectId}\`)}` and `testId="run-project-link"`. The
  `/projects/:id` route exists (project card click already navigates there). Keep `tone="accent"` (reads as
  a link). The AssignProjectControl branch (project-less run) is unchanged.

## Tests (`RunDetail.test.tsx`)
- Item A: assert the started meta cell renders an absolute date/time for a started run (not a "před …"
  relative string). Use a fixed `run.startedAt` and assert the formatted value appears (or that the
  relative-format text does NOT). Keep scheduled-run assertions.
- Item B: assert the project meta cell (for a run WITH a projectId) is a link that navigates to
  `/projects/:id` (the mocked `useRouter().push` is called with the right path — the phase-63 tests already
  set up that mock). The project-less run still shows the assign control.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/runs` clean.
- `rtk proxy npx vitest run apps/web/features/runs/components/RunDetail.test.tsx` green (RunDetail's only
  pre-existing red is the cost-cell cs-locale test).

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web.
- Do NOT run `git stash` (shared tree). Do NOT git commit — the caller commits. Only edit `RunDetail.tsx`
  (+ its test). Do NOT touch operator WIP or other phases' files. A pre-commit drift gate may complain
  about `.zibby/data/agents/_categories.json` — ignore it.
