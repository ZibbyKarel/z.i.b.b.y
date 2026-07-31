# Phase 126e — `/archiv` is 404ing on a route-ordering collision

> TODO.md item 5: _"stránka /archiv nefunguje"_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## Root cause (reproduced against a live API)

`libs/contracts/src/tasks/task-runs.contract.ts` declares the wildcard route **before** the
literal one:

| line | key | path |
| --- | --- | --- |
| 43-46 | `getTaskRun` | `GET /tasks/runs/:runId` |
| 134-136 | `listArchivedTaskRuns` | `GET /tasks/runs/archive` |

`@ts-rest/nest` registers Express routes in contract-key order, so `/tasks/runs/:runId` is
mapped first and swallows `/tasks/runs/archive` with `runId = "archive"`. Observed:

```
GET /api/tasks/runs/archive         → 404 {"message":"Task run \"archive\" not found"}
GET /api/tasks/runs/archive/counts  → 200 {"counts":{…},"total":21}
```

`/counts` survives only because its extra segment cannot match a single-param route.

The web page is fine. `apps/web/features/archive/Screen.tsx` sets `isError` from
`itemsError || countsError` (`Screen.tsx:80, 124-146`), so the 404 on the items query alone
renders the `QueryError` fallback — the operator sees a dead page even though the counts
query succeeded. The API implementation
(`apps/api/src/tasks/task-runs.controller.ts:27-40`,
`task-runs.service.ts:125-168`) is correct and needs no change.

Every existing archive test passes because they mock the API client — which is exactly why
none of them caught this. **The fix is not done until a test exercises real route
resolution.**

## Decisions to record in DECISIONS.md

- **D9 — fix by ordering, not by constraining the param.** Moving the two literal `archive`
  routes above `getTaskRun` is a one-line-each move with no runtime cost. Adding a
  path-param constraint that excludes `"archive"` would encode the collision into the route
  pattern and quietly break again the next time a literal sibling is added. Ordering is the
  rule that generalises: **literal paths before parameterised siblings.**
- **D10 — the regression guard is an API-level test, not a contract key-order assertion.**
  Asserting on object key order is brittle and tests the wrong thing; what must hold is that
  a real `GET /api/tasks/runs/archive` resolves to the archive handler.

## Implementation

### 1. `libs/contracts/src/tasks/task-runs.contract.ts`

Move `listArchivedTaskRuns` and `getArchivedTaskRunCounts` (currently ~L134-152) so both sit
**above** `getTaskRun` (L43). Pure reorder — do not change paths, schemas, or method names.

Add a comment at the top of the moved block stating why the position matters, e.g.:

```ts
// Literal `/tasks/runs/archive*` routes MUST stay above `getTaskRun`'s
// `/tasks/runs/:runId`: @ts-rest/nest registers routes in key order and Express
// matches first-wins, so a parameterised sibling declared earlier swallows them.
```

Without that comment the next reorder silently reintroduces the bug.

### 2. Audit the rest of the contract for the same shape

Before finishing, scan **every** router in `libs/contracts/src` for a literal path segment
that is declared after a parameterised sibling at the same depth
(`/x/:id` before `/x/<literal>`). Report what you find. Fix only the ones that are actually
shadowed; list any others in the commit body so they are on the record.

## Tests

### Primary — real route resolution (`--project api`)

Add to the task-runs API test suite (find where the existing task-runs controller/e2e tests
live and follow that pattern; do **not** invent a new harness):

- `GET /api/tasks/runs/archive` returns **200** with an archive payload, not a 404.
- `GET /api/tasks/runs/archive/counts` still returns 200 (pin the one that already worked).
- `GET /api/tasks/runs/<a real run id>` still returns that run — proves the reorder did not
  break the param route.
- `GET /api/tasks/runs/<unknown id>` still 404s with the run-not-found message.

The first assertion must **fail** against the current contract order. Verify that: stash the
contract fix, run the test, confirm red, restore the fix, confirm green. Report both
outcomes. A regression test that passes before the fix is worthless.

### Secondary — web (`--project web-components`)

`apps/web/features/archive/Screen.test.tsx`: the mocks hide the real failure, so add one
case pinning the *symptom* — when the items query errors, the page renders `QueryError`. That
documents why a green suite meant nothing here.

## Definition of done

1. `pnpm exec vitest run apps/api/src/tasks --project api` green, **and** the red-before-fix
   evidence for the primary assertion reported.
2. `pnpm exec vitest run --project contracts` green.
3. `pnpm exec vitest run apps/web/features/archive --project web-components` green.
4. Prettier + ESLint clean on touched files; `tsc -p tsconfig.base.json --noEmit` clean.
5. One commit: `fix(contracts): archive routes must precede /tasks/runs/:runId`.

## Out of scope

- Adding `/archiv` to `NAV_ITEMS` — its absence is deliberate (F2/F8d); it is reached from
  `ChatTasksPanel`'s "Archiv · N" link and the `/runs` redirect shim.
- Any redesign of the archive screen.
- Changing `Screen.tsx`'s `isError` composition (counts-succeeded-items-failed rendering a
  full-page error is defensible; the underlying 404 is the actual bug).
