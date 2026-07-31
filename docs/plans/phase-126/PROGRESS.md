# Phase 126 — progress & handoff

**Read this first after a context loss.** Then `rtk git log --oneline` on
`feat/phase-126-todo-arc` to see what actually landed.

- Source of truth for scope: [`../../../TODO.md`](../../../TODO.md) (7 operator-reported items)
- Execution order: [`ROADMAP.md`](./ROADMAP.md)
- Design/architecture calls: [`DECISIONS.md`](./DECISIONS.md)
- Per-item plans: `../phase-126a-*.md` … `../phase-126g-*.md`

**Branch:** `feat/phase-126-todo-arc` (cut from `main` @ `db7fb6db`) — one arc, commit per sub-phase.

**Last updated:** **all 7 landed.** Wave 4 (full validation) green — see _Validation gate_
below. Ready for the PR.

```
0be768c6 feat(roadmap): collapse blockers into one badge with a tooltip
01b67d6a feat(subsystems): attribute agent-kind runs to their owning subsystem
45a45ec1 docs(phase-126): five of seven landed; record the follow-ups the arc uncovered
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
| 126f | 6 | Blocked badge + tooltip + clickable blockers in detail | [`126f`](../phase-126f-blocked-badge-tooltip.md) | ✅ `0be768c6` |
| 126g | 7 | Subsystem orb orbiting task dots + connector comms | [`126g`](../phase-126g-subsystem-orb-agent-runs.md) | ✅ `01b67d6a` (1 rework round) |

## Validation gate (wave 4)

| Check | Result |
| --- | --- |
| `pnpm test` | **5390 passed**, 17 skipped, 0 failed (579 files) |
| `pnpm check:types` | clean — both `tsconfig.base.json` and `apps/web/tsconfig.json` |
| `pnpm check:cycles` | no circular dependency (804 files) |
| `pnpm check:lint` | 0 errors in first-party code; see the caveat below |

⚠️ **`pnpm check:lint` reports 195 errors that are not this repo's code.** Every one of
them is in `.design-match/.cdn-cache/*.js` — vendored CDN bundles in a **gitignored**
(`.gitignore:29`) local cache that the ESLint config does not exclude. First-party
`apps/**` / `libs/**` files carry warnings only (unused `_`-prefixed params, `<img>` vs
`next/image`), zero errors. CI checks out fresh with no such cache, so it passes there —
but locally the repo-wide lint gate is unusable as a pass/fail signal. Recorded as
follow-up 6.

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
6. **`pnpm check:lint` lints a gitignored cache directory** — 195 errors from
   `.design-match/.cdn-cache/*.js`, drowning the signal locally. The ESLint ignore list
   needs that path.
7. **An early SSE event can drop one orb comet** (126g) — if `useAgentsQuery` has not
   resolved when the first `agent-runs` event lands, `agentsRef.current` is `[]` and that
   one flare is skipped. Accepted: a decorative particle, not a stuck state, and the same
   posture already documented for the runs-cache race.

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
- **126f** — approved after one orchestrator fix. The badge collapse and tone rules are right,
  and the agent correctly verified the detail dialog's blocker click-through by *running* the
  existing test rather than by reading the code, then changed nothing there. Fix applied: this
  is the first rich-node `Tooltip` in the repo and the composition was invalid HTML — see D18.
  Accepted loss: the old per-blocker chip's hover title explained that an archived blocker can
  never unblock without a manual override; that sentence is now gone from the board (the `bad`
  tone carries it visually, and the dialog still says the source no longer returns it).
- **126g** — **returned once, then approved.** The first pass widened the run lookup and lit
  the orbit dots, but left `resolveEventOwner`'s scope gate at `pipeline-runs` only — so the
  connector comms, the *other half* of the operator's item 7, stayed silent for agent runs.
  The agent's own module comment stated the gate was intentionally untouched, citing D14; D14
  says no NEW animation is needed, not that the existing one should keep ignoring agent work.
  Returned with the verified event chain (`SubsystemOrbMap` → `flightForEvent` → the gate;
  `events.controller.ts` emits `agent-runs` with a matching `runId`) and red-before-green
  requirements. The rework also self-caught a second live defect the review had not asked
  about: `REPORT_STATUSES` held only the pipeline vocabulary, so an agent run's `error` or
  `awaiting-approval` would have produced no report comet even with the gate open. The two
  status enums are disjoint (`PipelineStateSchema` has no `error`/`awaiting-approval`;
  `RunStatusSchema` has no `failed`/`parked`), so widening the shared set is safe — verified
  against both schemas rather than taken on the agent's word.

## Recovery procedure

1. `rtk git log --oneline main..feat/phase-126-todo-arc` — what already landed.
2. Read this file's status board; the first row that is not ✅ is the resume point.
3. Read that sub-phase's plan file in `docs/plans/`.
4. Read [`DECISIONS.md`](./DECISIONS.md) before changing any approach — it records why,
   so a fresh session does not re-litigate a settled call.
