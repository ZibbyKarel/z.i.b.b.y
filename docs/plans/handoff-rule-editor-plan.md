# Handoff rule editor + chains retirement — implementation plan

Executes `docs/superpowers/specs/2026-07-22-handoff-rule-editor-ui.md`.
Contract-first, tests = DoD, no `any`, per-package `tsc -p` (never
`rtk pnpm typecheck`), i18n cs+en parity for every new string. Each phase is
independently committable; a sonnet subagent implements, Opus reviews the diff
before the next starts. Raw `git` for commits (rtk masks pre-commit hook failures
— verify every commit with `git log --oneline -1` + real `$?`).

Branch: `feat/subsystem-handoff-ui`.

---

## P1 — Backend: handoff-rules CRUD (contract-first)

**Files**
- `libs/contracts/src/handoff/handoff.schema.ts` — add `HandoffRuleInputSchema`
  (`HandoffRuleSchema.omit({ id: true })`) + `HandoffRuleInput` type. Keep `system`
  in the shape (server governs it).
- `libs/contracts/src/handoff/handoff.contract.ts` — add `createHandoffRule`
  (`POST /api/handoff-rules`, body input, 201), `updateHandoffRule`
  (`PUT /api/handoff-rules/:id`, 200/404), `deleteHandoffRule`
  (`DELETE /api/handoff-rules/:id`, 200 `{id}` / 404 / 403). Mirror
  `gate-rules.contract.ts` verbs + status codes + `strictStatusCodes`.
- `libs/contracts/src/index.ts` — export the new schema/type.
- `apps/api/src/handoff/handoff-rule.store.ts` — add `create(input)` (mint id via
  `collisionResistantId("hrule")`, force `system:false`, append, atomic write),
  `update(id, input)` (replace in place; a `system` rule may change
  enabled/tier/minSeverity/to but keeps `system:true`; never promote a user rule to
  system; throw `HandoffRuleNotFoundError` on miss), `delete(id)` (throw NotFound on
  miss, throw a `SystemHandoffRuleError` for a `system:true` rule). New
  `handoff-rule.errors.ts` for the two error types.
- `apps/api/src/handoff/handoff.controller.ts` — implement the 3 new routes over the
  store, mapping store errors → 404/403 via the shared `makeErrorMapper` pattern
  the gate-rules controller uses.

**Tests**
- `handoff.schema.test.ts` — `HandoffRuleInputSchema` rejects an `id`, accepts a
  valid rule sans id.
- `handoff-rule.store.test.ts` — create mints id + forces `system:false`; update a
  user rule; update a system rule tunes tier but keeps `system:true`; delete a user
  rule; delete a system rule throws; update/delete an unknown id throws NotFound.
- `handoff.controller.test.ts` (or extend an e2e) — 201/200/404/403 round-trips.

**DoD**: `pnpm exec tsc -p libs/contracts` + `-p apps/api` clean;
`pnpm exec vitest run libs/contracts/src/handoff apps/api/src/handoff apps/api/test/health.e2e.test.ts --project ...` green.

**Commit**: `feat(handoff): operator CRUD for handoff rules (create/update/delete + system-rule guard)`

---

## P2 — Web: the "Předávání" drawer tab + rule editor

**Files**
- NEW `apps/web/features/handoff/` — `queries/useHandoffRulesQuery.ts`
  (+ `getHandoffRulesQueryKey`, `select: selectApiResponseBody`),
  `mutations/useCreateHandoffRuleMutation.ts` / `useUpdateHandoffRuleMutation.ts` /
  `useDeleteHandoffRuleMutation.ts` (each invalidates the rules key), barrels.
- NEW `features/handoff/components/HandoffRulesSection.tsx` (list + `EmptyState`),
  `HandoffRuleRow.tsx` (mad-libs sentence + toggle/edit/delete),
  `HandoffRuleModal.tsx` (create/edit form via `@zibby/forms`; fields signalKind,
  minSeverity, target picker subsystem-XOR-pipeline, tier w/ explainers, enabled;
  `from` fixed to the drawer subsystem), `useHandoffRuleFormState.ts`.
- NEW `features/subsystems/components/SubsystemDrawer/HandoffTab.tsx` — filters rules
  to `from === subsystem.id`, renders `HandoffRulesSection`. Mirror `GatesTab`.
- `SubsystemDrawer.tsx` — `SUBSYSTEM_DRAWER_TABS` → add `"handoff"` (before
  `"artefakty"`); wire the `tab === "handoff"` panel arm.
- `apps/web/i18n/messages/{cs,en}.json` — all new strings incl. `drawer.tabs.handoff`,
  the sentence template, tier explainers, modal labels.
- Testid enums on every new component (project convention).

**Tests**
- `HandoffTab.test.tsx` — renders only this subsystem's outgoing rules; empty state
  when none; add-button opens modal.
- `HandoffRuleModal.test.tsx` — create submits an input without `id`; edit pre-fills;
  target picker enforces subsystem XOR pipeline; a system rule's delete is hidden/disabled.
- `parity.test.ts` stays green.

**DoD**: `pnpm exec tsc -p apps/web` clean; `pnpm exec vitest run apps/web/features/handoff apps/web/features/subsystems apps/web/i18n --project web` green.

**Commit**: `feat(web): edit handoff rules from the subsystem drawer (Předávání tab)`

---

## P3–P6 — Chains retirement (Part B)

Execute B1–B4 from `docs/plans/handoff-implementation-plan.md` verbatim. Sequenced
after P1–P2 so the rule editor exists before the chains UI is removed.

- **P3 (=B1)** — sever chains from the unified surfaces (API): remove chain-run
  production + `run.kind === "chain"` branches from `tasks/*`, `events/*`,
  `subsystems/*` (status aggregation + owner-backfill), `memory/*` (entity-MCP);
  remove `"chain"` from `OwnableEntityKindSchema`. Keep the chains module compiling
  until P4 (or fold P3+P4 if a partial state is impossible).
  **Commit**: `refactor(api): sever ChainRun from the unified run/status/mcp surfaces`
- **P4 (=B2)** — delete the chains feature (API + contracts): `apps/api/src/chains/*`,
  `libs/contracts/src/chains/*`, `app.contract.ts` routers, `app.module.ts` import,
  the `chains` docs-sync manifest row + `docs/api/chains.md`.
  **Commit**: `feat(api)!: remove the chains feature (superseded by handoff rules)`
- **P5 (=B3)** — delete the chains feature (web): `app/(dashboard)/chains/*`,
  `features/chains/*`, `"chains"` from `DOCK_IDS` + `NAV_ITEMS`, refs in `task.ts`,
  `ChatToolDock.tsx`, `useOwnerSubsystem.ts`, `SubsystemDrawer/*Tab.tsx`,
  `runEvents.tsx`, `state/config.ts`.
  **Commit**: `feat(web)!: remove the chains screen + toolbar link`
- **P6 (=B4)** — data cleanup: remove `.zibby/data/chains/`; regenerate the
  self-knowledge note (graph shrinks) as its own chore commit.
  **Commit**: `chore: drop .zibby/data/chains + regenerate self-knowledge`

**DoD (per P phase)**: package `tsc -p` clean + touched packages' vitest green +
`health.e2e` green. Full `pnpm check:types` + `pnpm test` at the very end before handoff.

`ArtifactRecord` + `ArtifactsStorageService` are NOT touched — handoff substrate.

---

## Review protocol (Opus)

Per phase, review the diff against: (1) spec fidelity, (2) contract-first ordering
(schema → contract → controller → web), (3) no `any` / no React `forwardRef`,
(4) tests assert behavior not just green, (5) system-rule guard actually enforced
(create forces `system:false`; system delete → 403; system update keeps the flag),
(6) i18n parity, (7) `health.e2e` green after every API phase. Rework notes go to a
fresh sonnet subagent; only a clean phase advances.
