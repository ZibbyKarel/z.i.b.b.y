# Handoff rule editor UI + chains retirement (Phase 2)

Builds on `2026-07-22-subsystem-handoff-design.md` (the engine) and the shipped
Part A (`feat/subsystem-handoff`: contracts + `HandoffService` + producers wired).
Phase 2 makes the standing handoff rules **operator-editable in the UI** and
retires the legacy `chains` feature the handoff engine replaced.

Branch: `feat/subsystem-handoff-ui`.

Scope decision (operator, 2026-07-22): **narrow** — the rule editor + chains
removal. The per-subsystem-type detail redesign (the earlier design note #1:
monitoring vs delivery vs research subsystems getting differentiated detail
views) is explicitly a **later phase**, not this one. The handoff tab added here
is the natural seed of that idea without committing to it.

Workflow: sonnet subagents implement each phase; Opus reviews the diff and
commits only a clean phase (the Part A cadence).

---

## Part 1 — Rules editable in the UI (additive)

### 1a. Backend — `handoffContract` from read-only to CRUD (contract-first)

Today `handoffContract` exposes only `getHandoffRules` (seeded, read-only). Extend
it to full CRUD, mirroring `libs/contracts/src/gates/gate-rules.contract.ts`
**exactly** (same verbs, same status codes, same id-in-path shape):

- `createHandoffRule` `POST /api/handoff-rules` — body `HandoffRuleInputSchema`, `201: HandoffRuleSchema`.
- `updateHandoffRule` `PUT /api/handoff-rules/:id` — body `HandoffRuleInputSchema`, `200: HandoffRuleSchema`, `404`.
- `deleteHandoffRule` `DELETE /api/handoff-rules/:id` — `200: { id }`, `404`, `403` for a system rule.

New schema `HandoffRuleInputSchema` = `HandoffRuleSchema` **without `id`** (the
server mints the id, like `GlobalGateRuleInputSchema` vs `GlobalGateRuleSchema`).
`system` stays in the input but is **server-governed**: a create always forces
`system:false`; an update to a system rule may flip `enabled` / `tier` /
`minSeverity` / `to` but can never set `system:true` on a user rule nor clear it
on a system one, and delete of a system rule is a `403` (they reseed from code
regardless — deletion is meaningless, so it is refused loudly).

`HandoffRuleStore` gains, alongside `list()`/`seedSystem()`:

- `create(input): HandoffRule` — mint a collision-resistant id, append, atomic write.
- `update(id, input): HandoffRule` — replace in place; throw `HandoffRuleNotFoundError` on miss.
- `delete(id): void` — remove; throw `NotFound` on miss, refuse a `system:true` rule.

The store stays the single `rules.json` list (system + user rules together); the
system rules are re-merged on boot (a missing/corrupt file reseeds only the system
set — a user rule lost to a corrupt file is acceptable, code is the source of truth
for the _system_ floor only). A `NestJS` controller `HandoffController` implements
the new routes over the store, mapping the store errors to 404/403 via the shared
`makeErrorMapper` pattern the gate-rules controller uses.

The engine (`HandoffService.evaluate`) is unchanged — it already reads the store's
`list()`; a freshly-created enabled rule takes effect on the next signal.

### 1b. Web — a "Předávání" tab in the SubsystemDrawer

`SUBSYSTEM_DRAWER_TABS` becomes `["roster","aktivita","gates","handoff","artefakty"]`.
The new `HandoffTab` (`features/subsystems/components/SubsystemDrawer/HandoffTab.tsx`)
mirrors `GatesTab`: it shows the rules whose `from === subsystem.id` — the
subsystem's **outgoing** handoff rules — each as a mad-libs sentence row:

> „Když **[subsystém]** vyprodukuje **[signalKind]** (≥ **[severity]**) → předat **[cíl]** · tier **[N]**"

with an enable toggle, edit, and delete affordance per row, and an "Přidat pravidlo"
button. Incoming rules (where `to === subsystem.id`) are out of scope for v1 (a
later read-only "sem míří" section is a nicety, not required).

New feature slice `features/handoff/` mirroring `features/gates/`:

- `queries/useHandoffRulesQuery.ts` (+ `getHandoffRulesQueryKey`), `select: selectApiResponseBody`.
- `mutations/useCreateHandoffRuleMutation.ts` / `useUpdateHandoffRuleMutation.ts` /
  `useDeleteHandoffRuleMutation.ts` — each invalidates the rules query key in its own `onSuccess`.
- A shared `HandoffRulesSection` (list + empty state) the tab renders, and a
  `HandoffRuleModal` (mirrors `gates/components/RuleModal`) for create/edit:
  fields = `signalKind` (free text), `minSeverity` (optional select over the 4-rung
  ladder), `to` (a target picker — subsystem from the `SUBSYSTEMS` registry XOR a
  pipeline from `usePipelinesQuery`), `tier` (1/2/3 with a one-line explainer each),
  `enabled`. `from` is fixed to the drawer's subsystem (not editable — the rule is
  authored _on_ the producer).

Uses `@zibby/forms` (RHF + zod adapter over DS primitives) like the other edit
dialogs; controlled via a `useHandoffRuleFormState` hook (the `useXFormState`
pattern). i18n cs+en for every new string; `parity.test.ts` stays green.

### 1c. Autonomy floor (unchanged, restated)

Editing a rule never widens the floor structurally: a Tier-1/2 rule still ends at
the existing PR gate downstream, a Tier-3 rule still parks an approval before
dispatch. The operator can _retune_ tiers but the gate machinery is not an agent
config an edited rule can weaken (Law 1). System rules are the seeded floor and
cannot be deleted, only tuned.

---

## Part 2 — Chains retirement (subtractive)

Execute Part B exactly as already specified in
`2026-07-22-subsystem-handoff-design.md` (Part B inventory) and
`docs/plans/handoff-implementation-plan.md` (B1–B4). Summary of the surface:

- **Web toolbar/nav**: remove `"chains"` from `DOCK_IDS` (`ChatToolDock.tsx`, the
  right-hand tool dock link the operator still sees) and from `NAV_ITEMS`
  (`state/config.ts`). Delete the `/chains` route (`app/(dashboard)/chains/*`) and
  `features/chains/*`; scrub refs in `task.ts`, `runEvents.tsx`,
  `useOwnerSubsystem.ts`, and any `SubsystemDrawer/*Tab.tsx`.
- **API**: sever `ChainRun` from the unified run feed, SSE events, entity-MCP, and
  subsystem status aggregation/owner-backfill; drop `"chain"` from
  `OwnableEntityKindSchema`; delete `apps/api/src/chains/*` and
  `libs/contracts/src/chains/*`, their `app.contract.ts` routers and
  `app.module.ts` import; remove the `chains` docs-sync manifest row +
  `docs/api/chains.md` (or fold a tombstone note).
- **Data**: remove `.zibby/data/chains/`.

`ArtifactRecord` / `ArtifactsStorageService` are **not** touched — they remain the
handoff substrate. The `scout-research` + `loom-architecture` seed rules already
cover the one live `audit-develop` chain, so no capability is lost.

---

## Testing / DoD (per phase)

Contract-first, per-package `tsc -p` (never `rtk pnpm typecheck`), tests = DoD,
i18n parity, no `any`, no React `forwardRef`. `health.e2e` (full AppModule boot)
must stay green across the API changes. Full `pnpm check:types` + `pnpm test` only
at the very end before handoff.

## Out of scope (later phases)

- Per-subsystem-type differentiated detail views (design note #1).
- Rule reordering UI (handoff matching is "first enabled match wins" but the seed
  set doesn't overlap; a reorder affordance can come with real conflicts).
- An incoming-rules ("sem míří") read-only section on the target's drawer.
