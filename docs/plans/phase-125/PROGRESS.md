# Phase 125 — progress & handoff

**Read this first after a context loss.** Then `git log --oneline` on
`claude/phase-125-roadmap-impl-iao1qm` to see what actually landed.

- Master plan: [`../phase-125-project-roadmap.md`](../phase-125-project-roadmap.md)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Decisions: [`DECISIONS.md`](./DECISIONS.md)
- Pattern references: [`recon/api-patterns.md`](./recon/api-patterns.md),
  [`recon/scheduler-pr-integrations.md`](./recon/scheduler-pr-integrations.md),
  [`recon/web-ds-patterns.md`](./recon/web-ds-patterns.md)

**Last updated:** wave 1 complete and pushed; wave 2 (125b + 125a-web) dispatched

**PR: https://github.com/ZibbyKarel/z.i.b.b.y/pull/65** — one big PR, commits accumulate into it.

---

## Status board

| Sub-phase | Scope                                                                                            | State                     |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| 125a-api  | Contracts + per-project store + level-mapping store/endpoints + `docs/api/roadmap.md`             | ✅ landed, reviewed, green |
| 125a-web  | `/settings?tab=tasks` level-mapping table                                                          | ✅ landed, screenshotted   |
| 125c      | `maxConcurrentRuns` + `countRunningGlobal()` + `capacityStatus()` + `?tab=runtime` control          | ✅ landed, reviewed, green |
| 125b      | `RoadmapSourceService` (Jira + GitHub), `adfToMarkdown`, attachments, upsert, sync endpoint         | ✅ landed, reviewed, green |
| 125d      | Roadmap tab, read-only: epic list, 4-column board, card, detail dialog                             | 🟨 agent running           |
| 125e      | Play + `RoadmapGateService`: gate, FIFO drain, task creation, merge hook + PR poll                  | ⬜ not started             |
| 125f      | Manual epic/task creation + dependency editing                                                     | ⬜ not started             |
| 125g      | Epic decomposition run + artifact contract + deterministic ingest                                  | ⬜ not started             |
| 125h      | Auto-sync tick + activity/briefing integration                                                     | ⬜ not started             |
| —         | Full-repo `check:lint` / `check:types` / `test`, screenshots, PR                                    | ⬜ not started             |

Legend: ⬜ not started · 🟨 in progress · 🟧 in review / rework · ✅ landed (committed)

## Where I am

**Wave 1 is complete, reviewed, committed and pushed.** Both sub-phases went through a rework
round; both defect sets were real.

- **125c** — the first cut regressed the default config (it serialized unscoped dispatch behind
  a global mutex even with no cap configured) *and* left the common race open (two different
  projects took different lock keys and both passed the global check). Fixed by nesting
  global-outer/project-inner and only taking the global lock when a cap exists. Regression
  tests verified to go red against the buggy shape first.
- **125a-api** — level-mapping `write()` documented a lock guarantee it did not provide;
  `delete()` skipped the lock its siblings took (an interleaved `update()` could resurrect a
  deleted item); a bad *project* id surfaced as a missing *item*; `CorruptRoadmapItemFileError`
  was declared and never thrown. All four fixed, each with a test confirmed to fail pre-fix.
- **Drive-by:** the `self-knowledge` CI job was red on `main` and is now fixed — see D-006's
  amendment. The gate checks `apps/api/data-test`, not the live data root.

**Wave 2 is running:** 125b (import/sync) and 125a-web (settings table), disjoint file sets.

## Open item: `briefing.spec.ts`

The only red CI check. `e2e/briefing.spec.ts` — `chat-briefing-message-card` never
appears after `POST /api/briefing/generate`. Ruled out so far: the testid and the
`ChatMessage` render path both still exist; `ChatBriefingSinkService`'s unit tests pass;
nothing on this branch touches briefing, chat or the transcript sink. Reported on PR #65.

**Next step if you pick this up:** reproduce it WITHOUT the playwright harness (which
won't launch here — the config resolves Chromium build 1223, the container has 1194).
Start the API and `apps/web` with `NEXT_PUBLIC_API_URL=http://localhost:3333`, `curl -X POST
/api/briefing/generate`, then load `/chat` in `/opt/pw-browsers/chromium` and look for the
testid. That is exactly what the spec does. Do it only when no agent is mid-edit in
`apps/web`, or the dev server recompiles under you and the result is meaningless.

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

1. Review wave 2 when both agents report; commit and push.
2. Then **wave 3**: 125d (the roadmap board UI) — it needs 125b's data shape to be settled.
   Remember `docs/api/roadmap.md`'s archived-blocker requirement when reviewing the card.

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
| `72f9402` | handoff refresh — 125c accepted                                          |
| `49eccab` | endpoint error-mapping docs                                              |
| `2e6efc6` | **fix:** regenerate the self-knowledge fixture note — unblocks CI on main |
| `f5fb796` | roadmap store lock / corruption / id-safety tests (29 green)             |
