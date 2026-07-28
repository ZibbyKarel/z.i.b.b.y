# Phase 125 — progress & handoff

**Read this first after a context loss.** Then `git log --oneline` on
`claude/phase-125-roadmap-impl-iao1qm` to see what actually landed.

- Master plan: [`../phase-125-project-roadmap.md`](../phase-125-project-roadmap.md)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Decisions: [`DECISIONS.md`](./DECISIONS.md)

**Last updated:** wave 0 (recon)

---

## Status board

| Sub-phase | Scope | State |
|---|---|---|
| 125a | Contracts + per-project store + level-mapping store/endpoints + `/settings?tab=tasks` | ⬜ not started |
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

Wave 0: three recon agents mapping (1) contract + API + file-storage + attachment patterns,
(2) web feature/DS/settings/project-tab patterns, (3) scheduler, budget, PR/merge,
integrations, ticks, activity. Recovery docs written. Nothing implemented yet.

## Next action

Once recon lands: dispatch **wave 1** — 125a and 125c in parallel.

## Commit log (this branch)

_(nothing yet)_
