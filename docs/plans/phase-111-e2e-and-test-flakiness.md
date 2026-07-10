# Phase 111 — E2E (playwright) regression + `test`-job flakiness

> Status: **planned / not started** — opened 2026-07-10 after phases 109–110 made the
> CI workflow green (build, cycles, lint, typecheck, self-knowledge all ✅).
>
> Two remaining reds, both **separate from the "every commit fails" install blocker** that
> 109/110 resolved. Neither is in the required CI checks (E2E is deliberately non-required per
> `.github/workflows/e2e.yml`; the flaky unit failures are intermittent).

## A. Playwright E2E — systemic backend-content regression (5 specs)

The suite was **green at phase 15** (e2e.yml: "proven green 3/3 locally before flipping the
gate"), so this is a regression accumulated in phases 16–108 (main was merged over red CI).

Failing (each fails all 3 CI attempts; 5 others pass, incl. `approval.spec` and 4/5 memory-graph):
- `briefing.spec` — after clicking generate, `getByTestId('activity-feed')` never appears.
- `channels.spec` — the seeded Tier-3 message never becomes a pending **channel** approval
  (global-setup logs `no pending "channel" approval after 20000ms`). The **agent** approval IS
  produced (approval.spec passes), so the gated-agent runner works; the **channel watcher** path
  does not triage in the e2e env.
- `memory-graph.spec` "the daily timeline lists today's daily note" — seeded
  `.e2e-data/vault/daily/<today>.md` row not found (other vault notes DO render).
- `pipeline-edit.spec` — "add a loop and see the retry arc" never appears.
- `pipeline-run.spec` — the task composer's `accordion-details` never lists the seeded "Demo Pipe".

**Ruled out:** testid drift — `activity-feed`/`activity-feed-item` (ActivityFeed.tsx) and
`accordion-details` (Accordion.tsx) all still exist as TestId-enum values. So the elements are
absent because the **data/content they render is never produced**, not because selectors moved.

**Hypotheses to check (needs a real cold-start run — `CI=true pnpm exec playwright test`):**
1. A store added since phase 15 (briefing? daily-timeline source? channel cursor?) has **no
   matching `*_DIR` in `playwright.config.ts` `apiEnv`**, so it reads/writes a different root than
   global-setup seeds → UI sees nothing. Compare `apiEnv` keys against the current set of file
   stores. This single cause could explain several specs at once.
2. The channel watcher's fake-adapter seam (`CHANNEL_FAKE_DIR`, `CHANNEL_TICK_MS=1000`) regressed
   — triage no longer runs or no longer opens an approval. Check `channels/` watcher + fake adapter.
3. Briefing generation no longer records a `briefing-generated` activity entry (check
   `apps/api/src/briefing/briefing.service.ts` + the activity-feed SSE/query wiring).
4. The task-composer pipeline list + pipeline-edit retry-arc are a web-side regression (composer
   dialog no longer lists pipelines from `/api/pipelines`, or the loop/retry-arc render changed).

### Method
- Cold-start locally exactly as CI: `CI=true pnpm exec playwright test` (forces fresh servers on
  :3333/:3000 — will conflict with any running `web:dev`, so stop that first). Use `--trace on` and
  the Trace Viewer / `test-results/` bundle to see each flow's real state.
- Fix per-flow; a shared root (hypothesis 1) may green several at once. Verify with the cold run.

## B. `test` job — flaky heavy pipeline/runner e2e (intermittent)

The deterministic `test` failures are fixed (phase 110). What remains is **intermittent**: under
full-suite parallel load in CI, one heavy async test fails per run — observed:
- `runner-core.test.ts > classifies a child that dies on a usage limit as paused-limit … resumeAt`
  (passes 34/34 in isolation, 3× locally).
- `pipelines.e2e.test.ts > seeded delivery pipeline > runs the chain through verify + the qualify
  review, finishing done`.

Both are timing/window-sensitive async runner tests. Likely fixes: pin the clock (inject a fixed
`now`/fake timers) instead of real `Date.now()` window math, and/or reduce cross-file parallel
contention for these heavy suites. Reproduce with repeated full-suite runs
(`ZIBBY_DATA_DIR=apps/api/data-test pnpm test`), not isolation (they pass alone).

## Done criteria
- `CI=true pnpm exec playwright test` green locally, then the E2E job green on the PR.
- The `test` job green across several consecutive runs (no intermittent flake).
