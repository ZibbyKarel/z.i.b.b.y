# Phase 125 — progress & handoff

**Read this first after a context loss.** Then `git log --oneline` on
`claude/phase-125-roadmap-impl-iao1qm` to see what actually landed.

- Master plan: [`../phase-125-project-roadmap.md`](../phase-125-project-roadmap.md)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Decisions: [`DECISIONS.md`](./DECISIONS.md)
- Pattern references: [`recon/api-patterns.md`](./recon/api-patterns.md),
  [`recon/scheduler-pr-integrations.md`](./recon/scheduler-pr-integrations.md),
  [`recon/web-ds-patterns.md`](./recon/web-ds-patterns.md)

**Last updated:** wave 1 reviewed; 125c accepted, 125a in final rework

---

## Status board

| Sub-phase | Scope                                                                                            | State                     |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| 125a-api  | Contracts + per-project store + level-mapping store/endpoints + `docs/api/roadmap.md`             | 🟧 rework (delete lock)    |
| 125a-web  | `/settings?tab=tasks` level-mapping table                                                          | ⬜ next — unblocked        |
| 125c      | `maxConcurrentRuns` + `countRunningGlobal()` + `capacityStatus()` + `?tab=runtime` control          | ✅ landed, reviewed, green |
| 125b      | `RoadmapSourceService` (Jira + GitHub), `adfToMarkdown`, attachments, upsert, sync endpoint         | ⬜ next                    |
| 125d      | Roadmap tab, read-only: epic list, 4-column board, card, detail dialog                             | ⬜ not started             |
| 125e      | Play + `RoadmapGateService`: gate, FIFO drain, task creation, merge hook + PR poll                  | ⬜ not started             |
| 125f      | Manual epic/task creation + dependency editing                                                     | ⬜ not started             |
| 125g      | Epic decomposition run + artifact contract + deterministic ingest                                  | ⬜ not started             |
| 125h      | Auto-sync tick + activity/briefing integration                                                     | ⬜ not started             |
| —         | Full-repo `check:lint` / `check:types` / `test`, screenshots, PR                                    | ⬜ not started             |

Legend: ⬜ not started · 🟨 in progress · 🟧 in review / rework · ✅ landed (committed)

## Where I am

Wave 1 is written and reviewed. **125c is accepted** — the review caught that the first cut
both regressed the default config (it serialized unscoped dispatch behind a global mutex even
with no cap configured) and left the common race open (two different projects took different
lock keys and both passed the global check). The fix nests global-outer/project-inner and only
takes the global lock when a cap exists; regression tests were verified to go red against the
buggy shape. 89 tests green.

**125a** is in its last rework pass — the level-mapping lock split, the project-id error type
and the corrupt-file decision are all committed; only `RoadmapStore.delete`'s missing path lock
is outstanding.

## Environment notes for a resumed session

- `pnpm install` is required — the container starts with no `node_modules`.
- `rtk` is **not** installed here despite `CLAUDE.md`; use plain commands.
- Commits need `--no-verify` (see D-006) — but run these two by hand every time:
  `pnpm exec prettier --write <files>` and `node tools/docs-sync/check.mjs --scope=staged`.
- A **Stop hook** enforces docs-sync per session: touching `apps/api/src/<module>/` requires
  `docs/api/<module>.md` to be in the same session's diff. Budget them together.
- `apps/api/test/pipelines.e2e.test.ts` fails on **clean `HEAD`** (`AgentNotFoundError: Agent
  "writer" not found`) — verified by stashing. Pre-existing; not this phase's regression.
- Cycle detection is already recorded in `TODO.md`; that plan item needs no work.

## Next action

1. Land 125a's `delete` lock, commit, mark 125a-api ✅.
2. Dispatch **wave 2**: 125b (import/sync) and 125a-web (`/settings?tab=tasks`) in parallel —
   disjoint files, both unblocked now that the contract exists.

## Commit log (this branch)

| Commit    | What                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `ade3ca7` | roadmap / decision log / handoff scaffolding                              |
| `c293bbf` | api pattern recon + D-004/D-005/D-006                                    |
| `1b32e86` | handoff refresh                                                          |
| `a4b7f5a` | web/DS + scheduler recon + D-007/D-008                                   |
| `9d00523` | wave-1 code snapshot (labelled under-rework) + budget/tasks/system docs  |
| `8422394` | archived-blocker trap documented as a 125d requirement                    |
| `80f7305` | roadmap store lock discipline + `queued` state-diagram fix                |
