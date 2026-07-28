# Phase 125 — progress & handoff

**Read this first after a context loss.** Then `git log --oneline` on
`claude/phase-125-roadmap-impl-iao1qm` to see what actually landed.

- Master plan: [`../phase-125-project-roadmap.md`](../phase-125-project-roadmap.md)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Decisions: [`DECISIONS.md`](./DECISIONS.md)

**Last updated:** wave 1 dispatched

---

## Status board

| Sub-phase | Scope | State |
|---|---|---|
| 125a-api | Contracts + per-project store + level-mapping store/endpoints + `docs/api/roadmap.md` | 🟨 agent running |
| 125a-web | `/settings?tab=tasks` level-mapping table | ⬜ blocked on web recon |
| 125c | `maxConcurrentRuns` + `countRunningGlobal()` + `atCapacity()` + `?tab=runtime` control | ⬜ not started |
| 125b | `RoadmapSourceService` (Jira + GitHub), `adfToMarkdown`, attachments, upsert, sync endpoint | ⬜ not started |
| 125d | Roadmap tab, read-only: epic list, 4-column board, card, detail dialog | ⬜ not started |
| 125e | Play + `RoadmapGateService`: gate, FIFO drain, task creation, merge hook + PR poll | ⬜ not started |
| 125f | Manual epic/task creation + dependency editing | ⬜ not started |
| 125g | Epic decomposition run + artifact contract + deterministic ingest | ⬜ not started |
| 125h | Auto-sync tick + activity/briefing integration | ⬜ not started |
| — | Full-repo `check:lint` / `check:types` / `test`, screenshots, PR | ⬜ not started |

Legend: ⬜ not started · 🟨 in progress · 🟧 in review / rework · ✅ landed (committed)

## Where I am

Recon #1 (contracts/API/file-storage/attachments) landed and is distilled into
[`recon/api-patterns.md`](./recon/api-patterns.md). 125a's API half is dispatched against it.
Recon #2 (web + design system + settings/project tabs) and #3 (scheduler, budget, PR/merge,
integrations, ticks, activity) are still running; 125a-web and 125c wait on them.

## Environment notes for a resumed session

- `pnpm install` is required — the container starts with no `node_modules`.
- `rtk` is **not** installed here despite `CLAUDE.md`; use plain commands.
- Commits need `--no-verify` (see D-006) — but run these two by hand every time:
  `pnpm exec prettier --write <files>` and `node tools/docs-sync/check.mjs --scope=staged`.
- Cycle detection is already recorded in `TODO.md`; that plan item needs no work.

## Next action

Dispatch 125c and 125a-web as soon as recon #2/#3 land. Then review 125a-api.

## Commit log (this branch)

| Commit | What |
|---|---|
| `84747e5` | roadmap / decision log / handoff scaffolding |
| `c6e8b2c` | api pattern recon + D-004/D-005/D-006 |
