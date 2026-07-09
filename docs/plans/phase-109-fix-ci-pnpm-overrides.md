# Phase 109 — Fix red CI: pnpm overrides / lockfile config mismatch

> Status: **in progress** — started 2026-07-09
>
> Goal: get GitHub CI (and E2E) green again. Right now **every** commit fails CI
> because all six CI jobs die at the shared `./.github/actions/setup` step, before
> any real check runs.

## Diagnosis (confirmed against run 29050020613)

Every CI job (`lint`, `typecheck`, `cycles`, `test`, `self-knowledge`, `build`) and
the E2E workflow fail at `pnpm install --frozen-lockfile` with:

```
ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
The current "overrides" configuration doesn't match the value found in the lockfile
```

Root cause is a **pnpm version drift** between local dev and CI, layered on a
deprecated config location:

- `package.json` still declares `"pnpm": { "overrides": { "multer": ">=2.2.0" } }`.
- CI pins pnpm **10** via `pnpm/action-setup@v4` (`.github/actions/setup/action.yml`).
- Local dev runs pnpm **11.10.0**, which **no longer reads** `pnpm.overrides` from
  `package.json` (prints `[WARN] The "pnpm" field in package.json is no longer read …
  keys ignored: "pnpm.overrides"`).

Because local pnpm 11 ignores the override, the committed `pnpm-lock.yaml` was
regenerated **without** any `overrides:` block (confirmed: no `override` string in the
lockfile), and the transitive `multer@2.1.1` (pulled by
`@nestjs/platform-express@11.1.24`) was **not** bumped to 2.2.0. In CI, pnpm 10 still
reads `pnpm.overrides` → "current overrides = {multer: >=2.2.0}" ≠ "lockfile overrides =
none" → frozen install aborts on every job.

The `multer >=2.2.0` pin exists for a reason (multer <2.2.0 has a DoS advisory), so the
fix must **preserve** the pin, not just delete it.

## Fix strategy

Two changes that together make "passes locally ⇒ passes in CI" hold by construction:

1. **Move the override to its modern home** — `pnpm-workspace.yaml`, which is read by
   both pnpm 10 and 11, and delete the dead `pnpm` field from `package.json`.
2. **Align the CI toolchain to local** — bump `pnpm/action-setup` from `version: 10` to
   `version: 11` so CI and dev run the same pnpm major. This kills the drift that is the
   underlying instability (lockfileVersion stays `9.0`, compatible with pnpm 9/10/11).

Then regenerate the lockfile so it records the override and bumps transitive `multer` to
`2.2.0`, and verify a frozen install passes.

## Tasks

- [x] **T1** — In `pnpm-workspace.yaml`, add:
      ```yaml
      overrides:
        multer: '>=2.2.0'
      ```
- [x] **T2** — In `package.json`, delete the trailing `"pnpm": { "overrides": … }` block.
- [x] **T3** — In `.github/actions/setup/action.yml`, change `version: 10` → `version: 11`
      and update the adjacent comment.
- [x] **T4** — Regenerate the lockfile: `pnpm install --no-frozen-lockfile`. Confirmed:
      lockfile now records the `overrides:` block and transitive `multer@2.1.1` is gone
      (only `multer@2.2.0` remains).
- [x] **T5** — Verify locally: `pnpm install --frozen-lockfile` exits 0. ✓
- [x] **T6** — Commit config + lockfile together on branch `fix/ci-pnpm-overrides`.
      Regenerated the self-knowledge note and staged it (pre-commit gate); did **not** run
      `graphify update .` mid-arc.
- [ ] **T7** — Open PR, watch CI. If `setup` now passes, the install blocker is fixed.

## Follow-on (expected, plan as Phase 110 if they surface)

The install failure has masked every real check for a while. Once setup is green, these
may fail and would each be their own fix:

- `test` job — memory notes pre-existing red `RunDetail.test.tsx` and `TaskCard.test.tsx`
  on `main`.
- `self-knowledge` job — drift between the committed fixture note and `apps/api/data-test`.
- E2E workflow — separate; assess after CI setup is green.

Do not thrash: if a follow-on job fails, capture the exact error, open Phase 110 with a
targeted fix, and iterate. Stop around 04:00 if unresolved.

## Verification / done criteria

- A pushed commit shows CI `setup` passing on all jobs (no `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`).
- The `multer >=2.2.0` security pin is preserved (lockfile resolves multer to 2.2.0 only).
- Ideally the full CI run is green; if a real check (test/self-knowledge) is red, it is a
  distinct, documented follow-on rather than the universal install blocker.
