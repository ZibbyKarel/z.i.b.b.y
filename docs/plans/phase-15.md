Phase 15 — Re-enable the Playwright e2e job in CI

Context

`e2e.yml` already contains a complete ubuntu `playwright` job (checkout → setup → resolve
Playwright version → cache `~/.cache/ms-playwright` → conditional `playwright install` →
`playwright test` → upload report) and a self-hosted macOS `playwright-selfhosted` job
(push to `main`, `CI=1`). But the ubuntu job is gated `if: github.event_name ==
'workflow_dispatch'` — DISABLED — for two reasons spelled out in its header note:

1. "the approval throughline needs the `claude` binary, which isn't installed on the runner"
2. "the cold-start dev-server path is flaky"

**Phase 14.3 eliminated both:**
- Token-free: `playwright.config.ts` apiEnv now sets `CLAUDE_BIN` to the committed
  `apps/api/test/fixtures/fake-claude.mjs` stub + a benign `FAKE_CLAUDE_INTENT`. The gated
  agent approval is produced by the stub (`requires_approval` → catch-all `ask`), so NO
  real `claude` binary is needed on any runner.
- Cold-start-deterministic: global-setup drains the approvals queue (API reject) and then
  polls until both seeded approvals are pending; the channel fixture id is unique per seed.
  Both specs assert durable outcomes (card leaves the queue / inbox handled), not transient
  optimistic UI.

Phase 15 is therefore thin CI glue: prove the cold path locally, flip the gate, guard it.

Progress (loop tracking)

- [x] 15.1 — Prove cold path + re-enable ubuntu e2e job + guard test (DONE 2026-06-14)

---

15.1 Prove the cold-server path, then re-enable the job

Proof (the real verification, since CI can't be observed without a push):
- `CI=true pnpm e2e` forces `reuseExistingServer: false` (`playwright.config.ts:77,86`), so
  Playwright boots fresh, isolated api+web servers and tears them down — the exact path a
  GitHub Actions runner takes (GHA sets `CI=true` by default for ALL runners). Result:
  **3/3 green, ~48–51s** on the cold path. This is strictly stronger than the 14.3 local
  verification (which reused a warm dev server) and closes that documented caveat.

Re-enable (`.github/workflows/e2e.yml`):
- Change the ubuntu `playwright` job gate from `if: github.event_name == 'workflow_dispatch'`
  to `if: github.event_name != 'push'` — it now runs on `pull_request` + `workflow_dispatch`
  but NOT `push`, leaving push-to-`main` coverage to the self-hosted macOS job (no redundant
  double-run on push). PR coverage is the point: "the PR is the gate".
- Rewrite the header note: 14.3 made it token-free (fake-claude `CLAUDE_BIN`) and
  cold-start-deterministic; the job runs on PRs but stays OUT of required branch-protection
  until it earns a CI track record (unchanged philosophy — promote later).

Guard test (`apps/api/test/e2e-workflow.test.ts`, mirrors `launchd-plist.test.ts`):
- The ubuntu `playwright` job is NOT gated to `workflow_dispatch`-only (the regression that
  would silently re-disable PR coverage) and the workflow triggers on `pull_request`.
- The job caches `~/.cache/ms-playwright` and runs `playwright test` + uploads the report.
- `playwright.config.ts` pins `CLAUDE_BIN` to `fake-claude.mjs` — the token-free guarantee
  the runner depends on (drop it and CI would need a real `claude` again). Static-content
  guard, not a runner test.

Verification: `pnpm lint`, `npx tsc -p apps/web/tsconfig.json --noEmit` (rtk typecheck
lies), `pnpm test` (the new guard test runs in the api vitest project), `pnpm exec vitest
run --project web-components`. Then `graphify update .`.

Watch-outs:
- A guard test that reads `.github/workflows/e2e.yml` from `apps/api/test/` resolves up
  three levels (`../../../.github/workflows/e2e.yml`) — same relative climb as
  `launchd-plist.test.ts` (`../../../ops/...`).
- The ubuntu runner does NOT set `CI=1` explicitly, but GHA exports `CI=true` for every
  runner, so `reuseExistingServer: !CI` is `false` there regardless — fresh servers. The
  `playwright-selfhosted` job sets `CI: "1"` belt-and-suspenders.
- Browser flake is inherent to any CI e2e; keeping the job non-required (not in branch
  protection) means a flaky run never blocks a merge while the suite earns trust. Promote to
  required only after a green streak.

Exit met: ubuntu e2e job runs on PRs, proven green on the local `CI=true` cold path,
token-free, with caching + report upload; guard test pins the shape; nothing pushed.
**Closes Phase 15.**
