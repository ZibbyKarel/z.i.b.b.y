# Phase 126 — progress & handoff

**Read this first after a context loss.** Then `rtk git log --oneline` on
`feat/phase-126-todo-arc` to see what actually landed.

- Source of truth for scope: [`../../../TODO.md`](../../../TODO.md) (7 operator-reported items)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Design/architecture calls: [`DECISIONS.md`](./DECISIONS.md)
- Per-item plans: `../phase-126a-*.md` … `../phase-126g-*.md`

**Branch:** `feat/phase-126-todo-arc` (cut from `main` @ `db7fb6db`) — one arc, commit per sub-phase.

**Last updated:** 5 of 7 landed (126a, 126b, 126c, 126d, 126e). Wave 2 (126f, 126g)
dispatched.

```
89c1d99d feat(roadmap): board shows all tasks until an epic is selected
78dcd01a feat(integrations): show the service's own logo on integration cards
6df74869 fix(runs): resolve the project display name for parked scheduled tasks
299d81f8 fix(contracts): archive routes must precede /tasks/runs/:runId
dda64f8b fix(channels): ingest only ZIBBY-opened PRs and explicit mentions from GitHub
e626bcb3 docs(phase-126): plan the TODO arc — six of seven items specced
```

---

## Status board

| Sub | TODO item | Scope | Plan | State |
| --- | --- | --- | --- | --- |
| 126a | 1 | GitHub question ingestion scope filter (ZIBBY-opened PRs + explicit @-mentions) | [`126a`](../phase-126a-github-question-scope.md) | ✅ `dda64f8b` |
| 126b | 2 | Integration cards show third-party brand logos | [`126b`](../phase-126b-integration-brand-logos.md) | ✅ `78dcd01a` (Slack gap — D17) |
| 126c | 3 | Roadmap board unfiltered when no epic selected | [`126c`](../phase-126c-roadmap-board-all-tasks.md) | ✅ `89c1d99d` |
| 126d | 4 | Roadmap-picked task has no project assigned (bug) | [`126d`](../phase-126d-roadmap-task-project-label.md) | ✅ `6df74869` |
| 126e | 5 | `/archiv` page broken (bug) | [`126e`](../phase-126e-archiv-route-collision.md) | ✅ `299d81f8` |
| 126f | 6 | Blocked badge + tooltip + clickable blockers in detail | [`126f`](../phase-126f-blocked-badge-tooltip.md) | 🤖 wave 2 |
| 126g | 7 | Subsystem orb orbiting task dots + connector comms | [`126g`](../phase-126g-subsystem-orb-agent-runs.md) | 🤖 wave 2 |

## Known follow-ups this arc created or uncovered (not in scope)

1. **Slack has no brand logo** (D17) — no CC0 asset exists upstream. Needs an asset from
   Slack's own brand kit, or it stays a `plug` glyph.
2. **Roadmap create dialog has no epic picker** — 126c had to disable "Nový task" in
   all-tasks mode because the dialog can only inherit a selected epic as `parentId`.
3. **`RoadmapDecompositionService.dispatch()`** omits `trustedProjectId` and hard-requires
   `project.path`, so epic decomposition cannot run at all for the two registered projects
   with no stored path (`cms4`, `shoptet-partner-cli`). Found while debugging 126d; a
   different defect from the reported one.
4. **No pause-on-hidden/blur throttle** in the DOM orb scene — every mounted `OrbNode` runs
   its own rAF forever. `SystemConfigSchema.powerSaver` survives from the retired WebGL scene
   and is still editable in Settings, but nothing reads it. 126g makes more nodes live more
   often, which makes this cost real for the first time.
5. **Goal-kind runs have no subsystem attribution** (D16) — no `ownerSubsystem` on any goal
   schema.

Legend: 🕐 recon · 🔬 debugging · 📝 planned · 🤖 agent running · 🔍 in review · ↩️ returned for rework · ✅ landed

## Findings that changed the shape of the work

- **126e** — not a page bug at all. `GET /tasks/runs/:runId` is declared *before*
  `GET /tasks/runs/archive` in the ts-rest contract, and `@ts-rest/nest` registers routes in
  key order, so Express resolves `archive` as a run id. Reproduced live: 404.
- **126g** — the orbiting dots and the connector comms are **already built and ported from
  the Velín-D design**. They never fire because both the web (`particle-mapping.ts:73`) and
  the API (`subsystems.service.ts:229`) gate subsystem attribution on `kind === "pipeline"`,
  and ~50% of real dispatched runs are agent-kind. `Agent.ownerSubsystem` already exists and
  is populated on all 50 stored agents. No new animation is needed.
- **126f** — the detail dialog's clickable blockers appear to already work
  (`RoadmapItemDialog.tsx:186-221` → `onSelectItem` re-targets the same dialog). Only the
  card's tag-per-blocker needs collapsing. To be confirmed by test, not by reading.
- **126d** — the first recon's hypothesis was **wrong**: `RoadmapGateService.release()`
  already passes `project.id` as `trustedProjectId`. Root cause still unproven; a debug agent
  is under orders to produce a failing test before any fix.

## Wave plan

| Wave | Sub-phases | Why grouped |
| --- | --- | --- |
| 1 | 126a, 126b, 126c, 126e | disjoint file sets — api/channels, web/integrations, web/roadmap, contracts/tasks |
| 2 | 126f, 126g | 126f rebases on 126c's `RoadmapCard.tsx`; 126g spans api + web and lands as one commit |
| 3 | 126d | blocked on the debug agent's proof |
| 4 | full validation: `check:lint`, `check:types`, `test`, `check:cycles`; PR | handoff gate |

Agents do **not** commit. The orchestrator reviews, then stages each sub-phase's own paths and
commits it separately — that is what keeps one commit per operator-reported item.

⚠️ **Concurrency cost, learned the hard way:** the pre-commit hook typechecks *both* tsc
projects repo-wide whenever any staged file is `.ts`/`.tsx` — not just the staged files. So a
single agent with a red file blocks **every** sub-phase's commit, no matter how disjoint. When
running a wave in one worktree, expect to commit the whole wave only after the last agent in it
is green. Markdown-only commits skip tsc and can still land.

## Review findings (orchestrator)

- **126b** — approved. One nit accepted: `KIND_LOGO` is `Partial<Record<…>>` so a new
  integration kind won't fail to compile there, but the sibling `KIND_LABEL_KEY` uses
  `satisfies Record<IntegrationKind, string>` and *will*, and a table test renders every kind.
  Coverage is adequate.
- **126c** — approved after one orchestrator fix. The agent correctly flagged a regression its
  own change introduced and did not paper over it: with no epic selected, the header's
  "Nový task" button had no `parentId` to pass, and `RoadmapItemFormDialog` has no epic picker.
  Fixed by disabling the button in all-tasks mode with a comment explaining why, plus a test.
  A real epic picker in the create dialog is the proper follow-up.
- **126e** — approved. Red-before-green evidence supplied; the e2e boots the real `AppModule`
  rather than mocking the client, which is exactly why the 27 pre-existing archive tests were
  green against a dead page.

## Recovery procedure

1. `rtk git log --oneline main..feat/phase-126-todo-arc` — what already landed.
2. Read this file's status board; the first row that is not ✅ is the resume point.
3. Read that sub-phase's plan file in `docs/plans/`.
4. Read [`DECISIONS.md`](./DECISIONS.md) before changing any approach — it records why,
   so a fresh session does not re-litigate a settled call.
