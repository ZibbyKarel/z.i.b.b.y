# Phase 126 — progress & handoff

**Read this first after a context loss.** Then `rtk git log --oneline` on
`feat/phase-126-todo-arc` to see what actually landed.

- Source of truth for scope: [`../../../TODO.md`](../../../TODO.md) (7 operator-reported items)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Design/architecture calls: [`DECISIONS.md`](./DECISIONS.md)
- Per-item plans: `../phase-126a-*.md` … `../phase-126g-*.md`

**Branch:** `feat/phase-126-todo-arc` (cut from `main` @ `db7fb6db`) — one arc, commit per sub-phase.

**Last updated:** 6 of 7 planned; wave 1 (126a/b/c/e) dispatched to Sonnet implementers.

---

## Status board

| Sub | TODO item | Scope | Plan | State |
| --- | --- | --- | --- | --- |
| 126a | 1 | GitHub question ingestion scope filter (ZIBBY-opened PRs + explicit @-mentions) | [`126a`](../phase-126a-github-question-scope.md) | 🤖 wave 1 |
| 126b | 2 | Integration cards show third-party brand logos | [`126b`](../phase-126b-integration-brand-logos.md) | 🤖 wave 1 |
| 126c | 3 | Roadmap board unfiltered when no epic selected | [`126c`](../phase-126c-roadmap-board-all-tasks.md) | 🤖 wave 1 |
| 126d | 4 | Roadmap-picked task has no project assigned (bug) | — | 🔬 debugging |
| 126e | 5 | `/archiv` page broken (bug) | [`126e`](../phase-126e-archiv-route-collision.md) | 🤖 wave 1 |
| 126f | 6 | Blocked badge + tooltip + clickable blockers in detail | [`126f`](../phase-126f-blocked-badge-tooltip.md) | 📝 wave 2 (shares `RoadmapCard.tsx` with 126c) |
| 126g | 7 | Subsystem orb orbiting task dots + connector comms | [`126g`](../phase-126g-subsystem-orb-agent-runs.md) | 📝 wave 2 |

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

## Recovery procedure

1. `rtk git log --oneline main..feat/phase-126-todo-arc` — what already landed.
2. Read this file's status board; the first row that is not ✅ is the resume point.
3. Read that sub-phase's plan file in `docs/plans/`.
4. Read [`DECISIONS.md`](./DECISIONS.md) before changing any approach — it records why,
   so a fresh session does not re-litigate a settled call.
