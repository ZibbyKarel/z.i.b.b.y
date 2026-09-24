# ZibbyCorp — progress and handoff

**Read this first after a context loss.** Then run `rtk git log --oneline` on the current
part's branch to see what actually landed.

- **Execution order and night-run loop:** [`ROADMAP.md`](./ROADMAP.md)
- **Binding calls:** [`DECISIONS.md`](./DECISIONS.md), D-001 … D-011
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

**Last updated:** 2026-09-24 20:10. The night run has started.

**Resume at:** ZC-00.

---

## Status board

Legend: ⬜ todo · 🟦 in progress · ✅ landed (sha) · ⛔ parked (reason)

### Part 0

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZC-00 | Bootstrap + baseline + rename inventory | ⬜ | |
| ZC-01 | Contracts subsystem → department | ⬜ | |
| ZC-02 | API rename | ⬜ | |
| ZC-03 | Migration script + fixture | ⬜ | |
| ZC-04 | Web rename | ⬜ | |
| ZC-05 | Docs + `check:names` gate | ⬜ | |
| ZC-06 | Validation → park | ⬜ | |

### Part E — Employees

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZE-01 | Employees, name pool, allocator, migration | ⬜ | |

### Part A

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZA-01 | Tokens, type, motion, theme | ⬜ | |
| ZA-02 | Primitive restyle | ⬜ | |
| ZA-03 | AgentGlyph, StatePill, CellStrip | ⬜ | |
| ZA-04 | Data and layout components | ⬜ | |
| ZA-05 | Overlay and nav components | ⬜ | |
| ZA-06 | Shell components + Splash | ⬜ | |
| ZA-07 | Lint wall + 20 className files | ⬜ | |
| ZA-08 | Validation → park | ⬜ | |

### Part B (ZB-04a / 05a / 05b are Part C, done last)

| Phase | Title | Status | Commit |
|---|---|---|---|
| ZB-01 | Shell, sections, rail, redirects | ⬜ | |
| ZB-02 | ORG map | ⬜ | |
| ZB-03 | Department detail + People | ⬜ | |
| ZB-04a | Tasks backend (parent/source/department) | ⬜ | |
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

## Follow-ups found

## PR drafts

## Operator action needed (morning)

- [ ] Review the draft PR `feat/zibbycorp` → `main` (D-012).
- [ ] Review the defaults applied (listed above).
