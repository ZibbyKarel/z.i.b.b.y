# Phase 110 — Green the CI checks unmasked by the phase-109 install fix

> Status: **in progress** — started 2026-07-10
>
> Context: Phase 109 fixed the universal `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` that made
> **every** CI job instant-fail at the setup step (the real cause of "every commit fails").
> With setup now passing, `build` and `cycles` are green, but the previously-masked checks
> are red. `main` has been merged over red CI for a while, so this is accumulated debt, not
> a regression from phase 109.

## Revealed failures (from PR #53 run 29053691172, reproduced locally)

| Check | Status | Root cause |
|---|---|---|
| `build` | ✅ pass | — |
| `cycles` | ✅ pass | — |
| `lint` | ❌ 1146 errors | ESLint lints `design/**` (prototype `.jsx` mockups full of undefined components). Config ignores `design-ref/**` but not `design/**`. **Zero** real lint errors outside `design/`. |
| `typecheck` | ❌ 2× TS2366 | `apps/api/src/machine/machine.service.ts` `plan()` (L99) and `execute()` (L167) switch on `action.kind` but omit the `open-url` case. `MachineAction` has 4 kinds (`rename-files`, `open-maps`, `open-folder`, `open-url`); `open-url` was added to the schema (`libs/contracts/src/machine/machine.schema.ts`) but never implemented → both functions can fall through returning `undefined`. Real latent bug. |
| `self-knowledge` | ❌ drift | CI runs `check:self-knowledge` with `ZIBBY_DATA_DIR=apps/api/data-test`; the committed fixture note drifted from the fixture catalog. (Local `pnpm check:self-knowledge` uses the live data dir, so it passed — that's why the gate didn't catch it.) |
| `test` | ❌ 9–10 failed | See breakdown below. |
| `playwright` (E2E) | ❌ | Assess after the CI-unit checks are green. |

### `test` breakdown (9 fail locally with `ZIBBY_DATA_DIR=apps/api/data-test`)

- **Web-component i18n text drift** (all "Unable to find element with text"):
  - `RunDetail.test.tsx` — `cena (odhad)` (cost meta cell)
  - `TaskCard.test.tsx` (2) — `úkol → úspěch`, `úkol → selhání` (origin/outcome badge)
  - `PipelineCard.test.tsx` — `zaparkováno` (parked state label)
  - `chat/Screen.test.tsx` — "KNOWN GAP (review finding #1)" — likely an intentionally-documented gap; confirm before touching.
- **API e2e**:
  - `pipelines.e2e.test.ts` (3) — `expected 'failed' to be 'done'`; log shows worktree setup failing on `git rev-parse origin/main` ("unknown revision") in a temp repo.
  - `projects.e2e.test.ts` (1) — "rejects a duplicate id (409) and an invalid body (400)".
  - `self-knowledge.e2e.test.ts` (1) — "reports no drift … fixture note in sync with the fixture catalog" → fixed by the self-knowledge fixture regen.

## Fix order (cheapest + most certain first; commit per group)

- [x] **T1 — lint**: added `"design/**"` to `ignores` in `eslint.config.mjs`. `pnpm exec eslint .` now exits 0 (9 warnings, 0 errors). Greens the `lint` job. ✓
- [x] **T2 — self-knowledge**: regenerated the committed fixture note with `ZIBBY_DATA_DIR=apps/api/data-test`; `ZIBBY_DATA_DIR=apps/api/data-test pnpm check:self-knowledge` now reports "up to date — no drift". Cleaned runtime pollution the generator wrote into `apps/api/data-test/`. Greens the `self-knowledge` job **and** `self-knowledge.e2e.test.ts`. ✓
- [x] **T3 — typecheck**: implemented the `open-url` case in `machine.service.ts` `plan()` and `execute()` (new `assertHttpUrl` fail-closed http(s) guard per the schema; reuses `opener`), plus a module-level `assertNever` exhaustiveness guard on both switches. `pnpm check:types` exits 0; existing machine tests still pass (22/22). ✓
- [ ] **T4 — web-component text drift**: investigate whether a shared i18n test wrapper / message key changed (common root cause across RunDetail/TaskCard/PipelineCard) vs each component. Fix so the asserted Czech strings render (or correct the assertions if the text legitimately changed). Verify each file with vitest.
- [ ] **T5 — api e2e**: pipelines (origin/main worktree setup) + projects (409/400). Determine if env-specific test-setup or real. Fix or document.
- [ ] **T6 — chat/Screen KNOWN GAP**: confirm whether this test is meant to fail (documents a gap) or is a real assertion; handle accordingly.
- [ ] **T7 — playwright/E2E**: assess after T1–T6.

## Guardrails

- Commit per green group so progress is durable; re-run affected checks locally before pushing.
- Do not run `graphify update .` mid-arc; run `pnpm self-knowledge:generate` (live) + stage before each commit for the pre-commit gate.
- No merge — PR #53 is the gate for the operator. Stop around 04:00 if not fully green and report.
