Phase 16 — CI e2e flake safety net (retries + trace-on-retry)

Context

Phase 15 re-enabled the ubuntu Playwright job on PRs. But `playwright.config.ts` still has
`retries: 0`, which makes the existing `trace: "on-first-retry"` dead config — a retry never
happens, so a trace is never captured. On a CI runner a single browser hiccup (a slow paint,
a GC pause, a one-frame race) reds the whole PR with nothing to diagnose from. The 2026
best-practice answer for a freshly-CI'd suite is a *bounded* retry-in-CI plus diagnostic
capture on the retry — never a blanket local retry (that masks real flakes during
development).

Progress (loop tracking)

- [x] 16.1 — Retry-in-CI + diagnostic artifacts + guard (DONE 2026-06-14)

---

16.1 Retry-in-CI + diagnostic artifacts

playwright.config.ts:
- `retries: process.env.CI ? 2 : 0`. In CI a flaky test gets up to 2 retries (3 attempts
  total); a *genuine* failure still fails on every attempt and reds the run. Locally
  `retries: 0` — flakes stay loud and surface during development, never silently retried
  (the BrowserStack/Autonoma guidance: retries are a CI safety net + flake *detector*, not a
  fix; never use them to paper over a real flake).
- Keep `trace: "on-first-retry"`; add `screenshot: "only-on-failure"` and `video:
  "retain-on-failure"`. The retry then leaves a full bundle (trace.zip + video + screenshot)
  in `test-results/` for the Trace Viewer.

.github/workflows/e2e.yml (both `playwright` and `playwright-selfhosted` jobs):
- They already upload `playwright-report/`. Add `test-results/` to the uploaded paths (that's
  where traces/videos/screenshots land) so the diagnostic is retrievable from the CI artifact,
  not just the HTML summary. Keep `if: ${{ !cancelled() }}` + `if-no-files-found: ignore` so
  the happy path (no failures → no test-results) stays green.

Proof (the retry path actually works):
- Write a throwaway `e2e/_retry-proof.spec.ts`: `expect(testInfo.retry).toBeGreaterThan(0)`
  — fails on attempt 0, passes on the first retry. Run `CI=true pnpm exec playwright test
  _retry-proof.spec.ts` and confirm Playwright reports it as flaky-then-passed (1 flaky, 0
  failed). DELETE it — never committed. This proves `retries` is wired without waiting for a
  real CI run.
- The real suite stays green locally (`retries: 0` → identical behaviour to Phase 15).

Guard test (extend apps/api/test/e2e-workflow.test.ts):
- `playwright.config.ts` contains `retries: process.env.CI ? 2 : 0` and the failure-artifact
  trio (`on-first-retry`, `only-on-failure`, `retain-on-failure`).
- `e2e.yml` uploads `test-results/`.
- A silent revert to `retries: 0` (or dropping the artifact upload) would quietly re-arm the
  no-diagnostic-flake foot-gun — guard the load-bearing shape.

Verification: `pnpm lint`, `npx tsc -p apps/web/tsconfig.json --noEmit`, `pnpm test` (the
guard test runs in the api vitest project), `CI=true pnpm e2e` still green. Then
`graphify update .`.

Watch-outs:
- `process.env.CI` is a string in the config; `retries: process.env.CI ? 2 : 0` is correct
  (truthy when CI is any non-empty string — GHA sets `CI=true`). Don't write `=== "true"`;
  the selfhosted job sets `CI: "1"`.
- `video: "retain-on-failure"` records every test and discards on pass — a small per-test
  cost, but only in CI (and the suite is ~10 specs). Acceptable for the diagnostic value;
  revisit if CI wall-time matters.
- Don't add a blanket local retry — it would hide exactly the cross-spec flakes 14.3 fixed.

Exit met: retries wired (proven via throwaway under CI=true), artifacts captured + uploaded,
guard pins the shape, local suite unchanged, nothing pushed. **Closes Phase 16.**
