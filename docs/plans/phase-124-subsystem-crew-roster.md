# Phase 124 — Subsystem detail: crew (Posádka) in the Roster tab

**Arc:** Chat UI ⇄ Velín-D design alignment. **Surface:**
`apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx` (+ i18n + test).

## Why
The drawer tab is named **Roster** (posádka / crew) but renders only the subsystem's owned
pipelines — there is no crew list. The design (`design/Z.I.B.B.Y/zibby/velin-c-detail.jsx`,
`VcCrew`) shows the subsystem's crew as its own scannable section: **avatar/glyph + name +
role + model badge**, one row per member. The pipeline canvas does show agents as graph
*nodes*, but those are positional and scaled-down — they are not a roster you can read.
Adding the crew section makes the tab honest and closes the last design gap in the
subsystem detail.

## Data — crew is DERIVED (there is no crew field)
`SUBSYSTEMS` (`libs/contracts/src/subsystems/subsystem.schema.ts`) is an identity-only
registry (phase 80) and `Agent` has **no** `subsystem` field. So derive crew from what the
subsystem already owns:

> **crew = the distinct agents referenced by the phases of the subsystem's owned pipelines.**

- Source: `ownedPipelines` (already computed in the tab) → `pipeline.phases`.
- Only `phase.type === "agent"` phases carry an agent (`phase.agent` is
  `AgentIdSchema.optional()`); `verify` phases have none — **skip them**.
- Resolve each id against `useAgentsQuery()`'s `agents` (already loaded in this tab — do NOT
  add a query). Dedupe by agent id, preserving first-seen phase order (pipeline order, then
  phase order) so the roster reads in execution order.
- An id with no matching agent (stale reference) is **skipped** — do not render a ghost row.
- Extract the derivation as a small pure helper (e.g. `deriveCrew(ownedPipelines, agents)`)
  with a comment naming *why* it's derived (no crew field on the registry), so the rule sits
  in one obvious place. Unit-test the helper's dedupe + verify-phase skip + stale-id skip.

## Scope (do)
1. **Crew section** above the pipelines in the Roster tab: a `Typography type="label"`
   heading (`subsystems.roster.crewTitle`, cs "Posádka" / en "Crew") + one row per member.
2. **Row** (compose from DS — mirror the design's VcCrew): `IconTile` showing the agent's
   `avatar` when set, else its `glyph` (IconTile already has an image mode — see the
   project-logo precedent); `name` (fall back to `id`); a secondary role line from
   `agent.description` (fall back to `agent.category`, else omit the line — never render an
   empty row); and the agent's `model` as a mono badge on the right when set.
   Rows are **static** (no click target) — v1 is a roster, not navigation.
3. **Empty:** when `ownedPipelines.length === 0` the existing `EmptyState` already owns the
   whole tab — do NOT add a second empty state; simply render no crew section. If pipelines
   exist but derive zero crew (all-`verify` pipelines), render no crew section either.
4. **Order:** crew section first, then the pipeline canvases, then owned chains (unchanged).

## Out of scope
- Any change to the pipeline canvases, `PipelineDialog`, `NewPipelineDialog`, chains, the
  other tabs, or the drawer frame.
- Making crew rows clickable / linking to `/agents/[id]` (possible follow-up — note, don't build).
- A crew field on the subsystem registry or any contract change. Derivation only, client-side.
- Phase-level `model`/`thinking` overrides — the badge shows the **agent's own** `model`
  (crew is about agent identity, not a per-phase override).

## Constraints
- **DS-composed only** in `apps/web`; no raw inline `style` / Tailwind on DOM nodes. Compose
  from `Container`/`Stack`/`Typography`/`IconTile`/`Card`. Reuse what the tab already imports.
- Reuse `useAgentsQuery` / `usePipelinesQuery` already in the component — **no new query**.
- React 19 (no `forwardRef`); no `any`; `noUncheckedIndexedAccess` is on.
- Extend the `RosterTabTestId` enum for the new parts: `CrewSection`, `CrewRow`
  (keep existing `Root`/`PipelinePanel`/`PipelineFit`/`ChainCard`).
- i18n: add `subsystems.roster.crewTitle` (cs "Posádka" / en "Crew") to BOTH
  `apps/web/i18n/messages/cs.json` and `en.json` with key parity (default locale cs).
- Update `RosterTab.test.tsx`: assert the crew derives from owned pipelines' agent phases,
  dedupes an agent used by two phases, skips `verify` phases and stale ids, renders the model
  badge, and renders no crew section when there are no owned pipelines. Select by testid;
  keep role/accessible-name assertions as assertions.

## Acceptance
- The subsystem drawer's Roster tab shows a **Posádka** list (avatar/glyph + name + role +
  model) above the pipeline canvases, derived from the owned pipelines' agent phases.
- `pnpm check:lint && tsc -p apps/web && pnpm test` green.

## Files
- Edit: `apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx`
- Edit: `apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.test.tsx`
- Edit: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
