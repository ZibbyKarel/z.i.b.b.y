# Phase 125 — implementation roadmap (execution order)

Master plan: [`../phase-125-project-roadmap.md`](../phase-125-project-roadmap.md).
Live status: [`PROGRESS.md`](./PROGRESS.md). Design/architecture calls: [`DECISIONS.md`](./DECISIONS.md).

Branch: `claude/phase-125-roadmap-impl-iao1qm` — **one big PR** for the whole arc.

---

## Wave plan

Sub-phases are dispatched to subagents in waves; a wave only starts once the previous
wave is code-reviewed and committed. Orchestrator (Opus) reviews every sub-phase and
returns it for rework when it fails review.

| Wave | Sub-phases | Parallel? | Rationale |
|---|---|---|---|
| **W1** | 125a (contracts + stores + level-mapping + `?tab=tasks`), 125c (`maxConcurrentRuns`) | yes — disjoint files | 125c touches only system config + scheduler + budget; 125a is all-new `roadmap/*` |
| **W2** | 125b (`RoadmapSourceService`: Jira + GitHub import, `adfToMarkdown`, attachments, upsert, sync endpoint) | single | needs 125a's schema + store |
| **W3** | 125d (roadmap tab, read-only board) | single | needs contracts + data from 125b |
| **W4** | 125e (play + `RoadmapGateService`), 125f (manual create + dependency editing) | yes — 125e is API-heavy, 125f is web-only | both build on 125d's screen; file overlap kept to the screen shell |
| **W5** | 125g (epic decomposition), 125h (auto-sync tick + activity/briefing) | yes | independent leaves |
| **W6** | Full-repo validation: `pnpm check:lint && pnpm check:types && pnpm test`, screenshots, PR | — | handoff gate |

## Per-sub-phase definition of done

Every sub-phase must land with:

1. Contract-first — anything crossing the wire exists in `libs/contracts/src/roadmap/*` first.
2. Unit tests for every pure helper (`blocked`, `readiness`, `adfToMarkdown`, edge parsing)
   and every new API service method.
3. `<Component>TestId` enum + `getByTestId` tests for every new web component.
4. i18n key parity in **both** `apps/web/i18n/messages/cs.json` and `en.json`.
5. Prettier + ESLint clean on every touched file; scoped vitest green.
6. A commit on the feature branch (`feat(roadmap): …`) — never batched with another sub-phase.

### Repo gates that bite this phase specifically

- **`tools/docs-sync`** (blocking, pre-commit): a brand-new `apps/api/src/roadmap` module
  needs a row in `tools/docs-sync/manifest.mjs`' `API_MODULE_DOC_MAP` **and** the doc file
  must exist. → 125a creates `docs/api/roadmap.md` and the manifest row in the same commit.
- **`pnpm check:self-knowledge`** — generated markdown must stay in sync; regenerate at the
  final validation gate if the generator picks the new module up.
- **`pnpm check:cycles`** (`madge --circular apps/web`) — the roadmap feature must not
  import back from `features/projects` in a way that closes a cycle.
- Vitest projects are split: `contracts`, `api`, `web` (i18n catalog checks only),
  `web-components` (jsdom, scoped to `apps/web/components/**`). A new component test under
  `apps/web/features/**` is **not** picked up by any project — put component tests where the
  configured project actually collects them, or wire the feature dir in deliberately.

## Hard invariants (rejected at review if violated)

- `blocked` is **derived**, never persisted.
- Re-sync never writes ZIBBY-owned fields (`lifecycle`, `runs`, `overrideBlocked`, `origin`,
  manual `dependsOn` edges).
- No `projectId` on `CreateTaskInput` — attribution stays server-derived via `paths` + `matchProject`.
- Nothing auto-merges, auto-pushes to a shared branch, or auto-dispatches. Play is the operator's click.
- No `any`, no `forwardRef`, no inline `style={{}}` on DOM nodes in `apps/web`.
- No change to `ScheduledTaskStatusSchema`, `WorkspaceService`, or merge-path behaviour.
- A roadmap bookkeeping failure must never surface as a merge failure (`.catch(() => {})`).
