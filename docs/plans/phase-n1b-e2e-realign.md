# Phase N1b — realign stale API e2e suites to shipped behavior

> Bug-fix phase (LOOP priority 4). 21 pre-existing e2e failures on HEAD block the
> `pnpm test` verification gate of every future phase. Root causes are STALE TESTS —
> the behavior they assert was intentionally changed; behavior is NOT touched here.

## Root causes → fixes

1. **Background-first `createTask`** (`tasks.controller.ts`: POST /api/tasks returns
   201 `{ outcome: "pending" }`; classify/limit/budget/dispatch run off the response
   path and flip the task to `dispatched` / `held` / `queued` / `scheduled(limit)` /
   `failed`). Stale tests assert the old synchronous outcomes on the response body.
   **Fix:** after POST, poll the task record (`GET /api/tasks/scheduled`) until it
   reaches the expected state, then assert off the record. Empty-catalog now lands
   as a `failed` task (never a silent no-op), not a sync 422.
   - `tasks.e2e` (5), `budget.e2e` (2), `budget-restart.e2e` (2), `activity.e2e` (1 —
     resolve `runRef` from the polled record), `limit-pause.e2e` (1), `parallel.e2e` (1).
2. **Integrations e2e assumed seeded projects** (`acme-app`, `zibby-self`) that the
   `data-test/` seed root does not contain → create 422 (unknown project FK) and
   cascading 404s. **Fix:** the suite seeds its own projects via POST /api/projects
   in `beforeAll` (self-contained, no shared-seed dependency). (8)
3. **Delivery seed drifted** — the seeded `delivery.pipeline.md` dropped the `n-9`
   phase (verify is the deterministic Tester; pr-autor added); `pipelines.e2e` still
   asserts an `n-9/test-automator.md` artifact. **Fix:** assert the current chain
   (architekt→koder→review→verify→dokumentator→pr-autor artifacts). (1)

## Tests

This phase IS tests — definition of done: `pnpm lint && pnpm typecheck && pnpm test`
fully green (0 failed), with no production-code change (except none expected).

## Guardrails

- Do NOT weaken behavior back to sync dispatch; the background path is the shipped
  Law-5 design ("a described task is always executed", failure lands on the record).
- No test deleted; every stale assertion is upgraded to the shipped contract.
