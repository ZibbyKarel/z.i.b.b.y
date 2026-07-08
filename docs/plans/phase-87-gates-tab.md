# Phase 87 — Drawer tab: Nastavení & Gates (subsystem lens over gate rules)

> Design doc wants: the subsystem's slice of gate rules, mad-libs rule sentences, the locked
> floor visible inside the same UI, plus the per-project autopilot dial.
>
> ⚠️ RECON CORRECTION + OPEN QUESTION (do not resolve silently): the doc claims gate-rule data
> "lives on the project" as an existing pattern. It does not — gate rules today are a GLOBAL
> catalog (`.zibby/data/gate-rules.json`, `gate-rules.contract.ts`); projects have a separate,
> simpler autonomy policy (`can_do_alone`/`always_ask` on the project entity). Re-homing gate
> rules per-project needs precedence semantics the design doc never specified → **left open
> for the operator**. This phase ships the subsystem lens over the EXISTING global catalog,
> which the design's own "data lives elsewhere, the tab is a filtered lens" principle covers.

## 1 — Contract + storage: `ownerSubsystem` on gate rules

- `GateRuleInputSchema` + `GateRuleSchema` gain `ownerSubsystem: SubsystemIdSchema.optional()`
  (attribution/filter only — NOT a match condition; evaluation semantics unchanged. A rule
  without the tag remains a global rule).
- `gate-rules.storage.service.ts`: passthrough on create/update/list; existing rules stay
  valid untagged.

## 2 — Tab body: filtered lens, same mechanics

`.../SubsystemDrawer/GatesTab.tsx` (+ test):

- Reuse `GateRulesSection` (already serves `/gates` AND the Settings tab — this is its third
  call site, exactly its design). Give it an optional `ownerSubsystem` filter prop: shows rules
  tagged for this subsystem; rules created from this tab are auto-tagged.
- **Floor visible**: render the locked POLICY floor (reuse `SystemFloorPanel`) inside the tab,
  read-only with the lock indicator — the floor is global by definition, shown unfiltered, so
  "the floor is visible, not hidden" (design doc).
- **Mad-libs sentence rendering**: each rule renders as the sentence
  „Než **[subsystém]** udělá **[akce]** → **[cíl]** → **[chování]**" derived from
  `match`/`decision`/`resolve`. v1 is sentence RENDERING of existing rule structure (+ the
  existing create/edit forms); a full sentence-builder AUTHORING UI is deferred until the
  per-project question above is answered (note this in the tab's code comment).
- **Autopilot dial**: show the ACTIVE project's autonomy policy summary (existing
  `ProjectAutonomyPolicy` data via the project queries; active project = the chat's
  `ProjectSwitcher` selection) read-only, with a link to the project's profile tab where it is
  already editable. No duplicate editor.

## Tests

- Schema: tagged rule round-trips; untagged rules unaffected (existing fixtures untouched).
- Filtering: mixed fixture → only this subsystem's rules listed; create from tab carries the
  tag.
- Floor panel renders locked rows (lock indicator asserted) and is not filterable away.
- Sentence rendering: one fixture per decision type (allow/notify/ask/deny) renders the
  expected Czech sentence; `ask` includes the resolve leaf.

## Verification (paste real output)

- `npx tsc -p` contracts, api, web — clean; `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/gate-rules apps/web/features/gates apps/web/features/subsystems` — green.

## Constraints

- Law 1: nothing in this tab may weaken the floor — locked rules stay non-editable through
  every path (assert the UI offers no edit affordance on `locked`).
- Evaluation engine untouched: the tag changes attribution, never matching.
- The per-project re-homing open question goes verbatim into the final report.
