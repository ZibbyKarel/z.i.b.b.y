# TODO 44 Runs widget percent + elapsed — Implementation Plan

> Execution: Subagent-Driven (small enough to execute inline task-by-task with TDD).

**Goal:** Under a running run's progress bar show `pct% · elapsed`, drop the phase count.

**Files:** `apps/web/features/bridge/state/rows.ts` (add `startedAt` to `RunRowVm`),
`apps/web/features/bridge/widgets/RunsWidget.tsx`, `RunsWidget.test.tsx`,
`apps/web/i18n/messages/{cs,en}.json` (`stages` key → `pct` / `pctElapsed`).

### Task 1: failing test

- [ ] In `RunsWidget.test.tsx`, a workflow-less running run with fake time 3m12s after
      `startedAt` shows a meta test-id with `3m 12s` and no "phases"; a workflow run with a pct shows
      `50% · …`. Run, see it fail.

### Task 2: implement

- [ ] `RunRowVm.startedAt` in `runRows`.
- [ ] `RunsWidgetTestId.Meta`; `RunElapsed` leaf using `useNow(1_000)` + `formatDuration`.
- [ ] i18n: replace `stages` with `pct` (`{pct}%` / `{pct} %`).
- [ ] Run test, prettier, eslint, tsc; commit.
