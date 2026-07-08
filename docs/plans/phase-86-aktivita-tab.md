# Phase 86 — Drawer tab: Aktivita (scoped runs + live log)

> Design doc: "Aktivita — recent runs, live log. Reuses today's Runs & Activity page behavior,
> scoped to this subsystem." RECON CORRECTION: there is no `mergeRunFeed`; the live feed is
> `RunEventsProvider` (SSE → query invalidation) + the runs queries, and the live log is
> `RunLogStream` (offset-polled tail over `/api/tasks/runs/:runId/logs`). Reuse those.

## 1 — Scoped runs endpoint or client filter (decide by what exists)

Runs are served by the unified task-runs resource. Preferred: add an optional
`ownerSubsystem` query filter to the EXISTING list endpoint (contract param + service filter:
run → pipeline/chain id → phase-81 owner tag), so the drawer doesn't fetch everything. If the
list endpoint already returns pipeline ids per run, a client-side filter over the existing
query is acceptable for v1 — pick whichever touches less code and note the choice in the PR.
Do NOT create a parallel runs resource (unified-runs is a hard-won invariant).

## 2 — Aktivita tab body

`.../SubsystemDrawer/AktivitaTab.tsx` (+ test):

- Recent runs list, newest first, reusing the run-card composites the Runs screen / chat tasks
  panel already use (status tone, worker, started-at) — one card per task, consistent with the
  one-card-per-task discipline. Cap ~20 with a "Všechny runy" link to `/runs` (the global page
  remains the full view).
- Expanding a running/errored run inline shows the live log tail via `RunLogStream` — same
  component, no fork. Completed runs link to the run detail page (existing route) for full
  output/PR link.
- Live-ness: `RunEventsProvider` already invalidates run queries on SSE events; the tab gets
  freshness for free as long as it uses the standard query keys — verify, don't rebuild.

## Tests

- Scoping: fixture runs across owned/unowned pipelines → only owned rendered.
- Expand → `RunLogStream` mounted with the right runId; collapse unmounts.
- Empty state (no runs yet) is honest and translated.
- If the endpoint filter was chosen: service test for the `ownerSubsystem` filter mapping.

## Verification (paste real output)

- `npx tsc -p` (touched projects) — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems` (+ `apps/api/src/tasks` if endpoint touched)
  — green.
- Visual: screenshot Aktivita tab for Forge with at least one run row (seed a demo run if
  needed — `AGENT_RUNNER_MODE=demo` machinery exists).

## Constraints

- No new SSE stream, no new log transport — `RunLogStream` + standard query keys only.
- Keep the tab cheap when closed (no polling while the drawer/tab is not visible — mount
  queries inside the tab body).
