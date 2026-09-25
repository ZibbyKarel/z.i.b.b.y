# ZibbyCorp — progress and handoff

**Read this first after a context loss.** Then run `rtk git log --oneline` on the current
part's branch to see what actually landed.

- **Execution order and night-run loop:** [`ROADMAP.md`](./ROADMAP.md)
- **Binding calls:** [`DECISIONS.md`](./DECISIONS.md), D-001 … D-016
- **Defaults for open questions:** [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md)
- **Where everything moves:** [`ROUTE-MAP.md`](./ROUTE-MAP.md)
- **Phase specs:** [`PART-0.md`](./PART-0.md) · [`PART-A.md`](./PART-A.md) · [`PART-B.md`](./PART-B.md)

**Branch:** `feat/zibbycorp`, cut from `main` @ `6ccf889c`. The backup tag `v3.0` is pushed,
and the data tarball is in `.zibby/backups/`. D-012 … D-015 are binding.

**Phase order:** Part 0 → Part E → Part A → Part B → Part C.

- Part E is `PART-E.md`.
- Part C is ZB-04a, ZB-05a and ZB-05b from `PART-B.md` (chains, done last).
- In Part B, the People screens show **employees** (D-015), and the agent library (the
  positions) moves to `/system/registries/positions`.

**Last updated:** 2026-09-24. Part 0 landed (see board).

**Resume at:** 2026-09-25 PAUSED by the operator and moved to another machine. The tip
commit is a **WIP commit made with `--no-verify`** (red typecheck), containing two
half-done phases — finish them first, see "Paused WIP" below.

---

## Status board

Legend: ⬜ todo · 🟦 in progress · ✅ landed (sha) · ⛔ parked (reason)

### Part 0

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZC-00 | Bootstrap + baseline + rename inventory | ✅ (with ZC commit) | |
| ZC-01 | Contracts subsystem → department | ✅ | |
| ZC-02 | API rename | ✅ | |
| ZC-03 | Migration script + fixture | ✅ applied to the real data (backup in `.zibby/data/_backup-zibbycorp-*`) and to the fixture | |
| ZC-04 | Web rename | ✅ | |
| ZC-05 | Docs + `check:names` gate | ✅ | |
| ZC-06 | Validation → park | ✅ | |

### Part E — Employees

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZE-01 | Employees, name pool, allocator, migration | ✅ | e144954f |

### Part A

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZA-01 | Tokens, type, motion, theme | ✅ | 4216a05a |
| ZA-02 | Primitive restyle | ✅ | 6ff2ba9f |
| ZA-03 | AgentGlyph, StatePill, CellStrip | ✅ | 4216a05a |
| ZA-04 | Data and layout components | ✅ | ba9406b9 |
| ZA-05 | Overlay and nav components | ✅ | ba9406b9 |
| ZA-06 | Shell components + Splash | 🟨 WIP (paused) | |
| ZA-07 | Lint wall + 20 className files | ⬜ | |
| ZA-08 | Validation → park | ⬜ | |

### Part B (ZB-04a / 05a / 05b are Part C, done last)

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZB-01 | Shell, sections, rail, redirects | ⬜ | |
| ZB-02 | ORG map | ⬜ | |
| ZB-03 | Department detail + People | ⬜ | |
| ZB-04a | Tasks backend (parent/source/department) | 🟨 WIP (paused) | |
| ZB-04b | Tasks UI | ⬜ | |
| ZB-05a | Chains backend on HandoffService | ⬜ | |
| ZB-05b | Chains UI | ⬜ | |
| ZB-06 | Goals / Companies / Teams / Projects | ⬜ | |
| ZB-07 | Activity | ⬜ | |
| ZB-08 | Policy | ⬜ | |
| ZB-09 | Knowledge | ⬜ | |
| ZB-10 | Ledger | ⬜ | |
| ZB-11 | System settings + registries | ⬜ | |
| ZB-12 | ⌘K + COO dock + voice | ⬜ | |
| ZB-13 | Cleanup | ⬜ | |
| ZB-14 | Validation → park | ⬜ | |

---

## Defaults applied

When a phase applies a default from `OPEN-QUESTIONS.md`, append one line here:
`O-xx → default (phase, sha)`.

## Execution notes

- The rename is driven by a **codemod**, not by hand. There are two scripts:
  - `tools/migrate/zibbycorp-map.mjs` is the shared rename map.
  - `tools/migrate/zibbycorp-codemod.mjs` applies it across `apps`, `libs`, `tools` and
    `e2e`, with dry-run by default.
- The data migration reuses the same map.
- Neutral dir names from the map:

  | Old | New |
  |---|---|
  | `sentinel/` | `security/` |
  | `maestro/` | `release/` |
  | `herald/` | `comms/` |
  | `loom/` | `arch/` |

  The class names follow the same words: `SecurityService`, `ReleaseService`,
  `CommsService`, `ArchService`.
- Dry-run result: 364 files edited, 84 moved.
- `ledger` is excluded from the automatic rules because it is also a generic word. Handle
  its department-id uses by hand.

- **Baseline reds** (pre-existing): the e2e specs `briefing.spec.ts` and
  `channels.spec.ts`, and 7 apps/web typed-route `/teams` errors. The old known-reds list
  was stale; see `baseline.md`.
- **The migration skips inbound dirs** (`channels/`, `roadmap/`, `integration-state/`),
  because of Law 4 and false positives such as "Atlassian Forge" and "OpenAI Codex".
- The codemod's line-start-key rule also rewrote non-department keys in `.mjs`/JSON files
  (the docs-sync manifest). Those were fixed by hand; tsc catches the TS cases.

## Follow-ups found

## PR drafts

## Operator action needed (morning)

- [ ] Review the draft PR `feat/zibbycorp` → `main` (D-012).
- [ ] Review the defaults applied (listed above).

- **`git grep -E '\b…'` is a false-clean on macOS** — POSIX ERE has no `\b`, so the I-6 grep
  printed nothing even with hits. `tools/check-names.mjs` (`pnpm check:names`, pre-commit + CI)
  uses `git grep -P`. Always use `-P` for word-boundary greps.
- The codemod over `.claude/skills` rewrote third-party skill text ("OpenAI Codex" →
  "Knowledge"); all `.claude/**` edits were reverted. It also turned the verb "forge" into
  "dev" in comments ("a client can never forge provenance") — reworded to "fake".
- Part 0 validation: tsc 0 (base + web), `pnpm test` = baseline (5760 passed / 17 skipped),
  `eslint apps libs tools --quiet` 0, `check:names` clean, self-knowledge no drift. e2e not re-run.
- Historical docs (`docs/superpowers`, `docs/audit`, `docs/ns2`, `docs/hud2chat`, `docs/reviews`,
  `docs/research`) keep the old vocabulary on purpose — they are records.

- 2026-09-24 ~21:00 → 2026-09-25 00:00: both subagents (ZE-01, ZA-01+03) died on the account
  session rate limit (429, resets midnight Prague) with partial edits in the tree. Resumed
  via SendMessage at 01:47 from their transcripts; partial edits kept, not reverted.
- ZE-01: real `.zibby/data` migrated — 50 employees hired (pool grown to 60, D-018). Follow-up:
  allocator waiters wake only on `release`, so a hire made while a stage is queued does not
  unblock it until the next release (minor; revisit in Part B if the People screen hires live).
- `pipelines.e2e` flaked once (socket hang up) in the full run, green 2/2 in isolation — the
  known pre-existing flake.
- 2026-09-25 ~03:00 → 06:40: second rate-limit stop (ZA-04 partial, ZA-05 nothing written).
  Resumed 07:15 on the operator's "pokračuj".

## Paused WIP (2026-09-25, operator moved machines)

The tip commit `wip(zibbycorp): …` was made with `--no-verify`; the tree does NOT typecheck.

1. **ZA-06 (DS shell)** — new, untested folders `libs/design-system/src/components/{AppFrame,
   AppHeader,Rail,ChatDock,Splash,Wordmark}`. Not yet exported from `index.ts`, and
   tests/stories may be incomplete. Finish per `PART-A.md` ZA-06. The source to port for
   Splash is `apps/web/components/LoadingScreen/*`; don't delete that yet (ZA-07 does).
2. **ZB-04a (tasks backend)** — half-wired. `TaskTarget {kind:"chain"}` has been added to
   contracts, and `task-parents.schema.ts` / `task-parents.service.ts` exist. The
   departments `getDepartmentSubtasks` route is in the contract but not implemented.
   Known tsc reds:
   - `apps/api/src/departments/departments.controller.ts` — missing `getDepartmentSubtasks`
     handler;
   - `apps/api/src/chat/chat-tools.service.ts:263` and `apps/web/features/tasks/task.ts:195-198`
     — exhaustive switches/Records need a `chain` case.
   Planned D-019 (not yet written into DECISIONS): creating a `{kind:"chain"}` task before
   ZB-05a exists is rejected with a clear 400 — never a silent no-op.

Then continue: ZA-07 → ZA-08 → Part B (ZB-01 …) → Part C (ZB-05a, ZB-05b) → final validation,
push and a **draft** PR into main (never merge).
