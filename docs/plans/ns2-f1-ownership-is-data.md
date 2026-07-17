# F1 — Ownership Is Data — Implementation Plan

> NS2 phase F1. Planned by Opus subagent, reviewed by orchestrator (see addendum at
> the bottom — binding). Branch `north-star-2`. Contract-first, tests = DoD, no
> `any`, DS primitives in web, testid-enum selectors. Three independently-committable
> subphases: **F1a contract**, **F1b seed + write-validation**, **F1c stored roster**.

## Roadmap premises the code disproves / corrects (read first)

1. **"If 10 orbs need layout changes."** They do not. `SubsystemOrbMap` builds nodes
   by mapping over `SUBSYSTEMS` (`apps/web/features/chat/components/SubsystemOrbMap.tsx:107-118`)
   and hands them to DS `OrbMap`, which lays them out with
   `ellipseLayout(w, h, nodes.length, merged)` (`libs/design-system/src/immersive/OrbMap/OrbMap.tsx:111`).
   `ellipseLayout` distributes `count` nodes generically around the ellipse
   (`libs/design-system/src/immersive/ellipseLayout.ts:56-61`). **Going 8→10 orbs
   requires zero orb-layout code.** The ring auto-reflows. The _only_ mechanical
   breakage is the two exhaustive `Record<SubsystemId, IconName>` glyph tables —
   TS won't compile without their new keys. Visual density/legibility at 10 orbs is
   a **follow-up redesign**, not F1 scope.

2. **"Monitor registration gets an owner."** There is **no standalone monitor
   entity**. A "monitor" is a GitHub `Integration` whose `config.streams` includes
   `"ci"` (`libs/contracts/src/integrations/integration.schema.ts:81`), selected by
   `MonitorAdapter.wants()` (`apps/api/src/monitors/monitor-adapter.ts:54-83`); the
   watcher iterates `integrations.list()` (`monitor-watcher.service.ts:88-94`).
   `MonitorEvent` only references `integrationId` (`monitor.schema.ts:27-42`).
   **Decision: monitor owner is integration-derived** — adding `ownerSubsystem` to
   `Integration` covers monitors for free.

3. **"channel ownership → puls/herald split by stream kind."** No stored field
   distinguishes reply-capability; an `Integration` carries only `kind` + `config`
   (`integration.schema.ts:18,143-168`). The split is **not cleanly derivable at
   seed time** → **all integrations seed to `puls`**; the herald split is deferred
   to a phase that introduces a reply-capability criterion (`TODO(F-herald)`).

4. **codex/ledger own no dispatchable entities yet.** Memory machinery and
   budget/limits are **services**, not stored entities carrying an owner tag. The
   backfill assigns codex/ledger **nothing**; their rosters render empty. Expected —
   they are seated by charter now, wired in F4/F5. Do not invent entities.

5. **Some pipelines already carry `ownerSubsystem`**
   (`.zibby/data/pipelines/delivery.pipeline.md`, `code-audit.pipeline.md`, Phase 81).
   The backfill **must be idempotent** (skip already-owned).

---

## F1a — Contract: registry → 10 ids + `ownerSubsystem` on Agent & Integration

### Goal

Grow the closed registry to 10 (`codex`, `ledger`), add `ownerSubsystem` (optional)
to `Agent` and `Integration`, update **every** exhaustive `SubsystemId` table so
api + web compile. No behavior change yet.

### Verified current state

- Enum: `libs/contracts/src/subsystems/subsystem.schema.ts:9-18` (8 ids). Registry
  array: `:48-106`. Color regex `/^#[0-9a-f]{6}$/i` at `:37`.
- Existing colors: forge `#5b8def`, puls `#f2749e`, sentinel `#34c9bd`, maestro
  `#e0a83c`, beacon `#f4785c`, scout `#46cf8b`, herald `#56c4d6`, loom `#b07cff`.
- `ownerSubsystem: SubsystemIdSchema.optional()` precedent: `pipeline.schema.ts:139`,
  `chain.schema.ts:35`, `gate.schema.ts:170`.
- `AgentSchema`: `agent.schema.ts:44-87`; `UpdateAgentSchema` `:99-101`.
- `IntegrationObjectSchema`: `integration.schema.ts:143-168`;
  `CreateIntegrationObjectSchema` `:185-193`; `UpdateIntegrationSchema` `:205-212`.
- **Exhaustive `Record<SubsystemId, …>` tables (compile-breakers):**
  - `apps/web/features/subsystems/subsystemVisuals.ts:35-44` — `SUBSYSTEM_GLYPH`.
  - `apps/web/features/chat/components/ChatQuickTask.tsx:41-50` — duplicated
    `SUBSYSTEM_GLYPH`.
  - `apps/web/features/chat/subsystemLoad.ts:41-42` — `Partial<Record<…>>`: no change.
  - `SUBSYSTEM_ORB_STATE` (`subsystemVisuals.ts:26-31`) keyed by `SubsystemState`: no change.
- Iterations over `SUBSYSTEMS` (auto-extend): `SubsystemOrbMap.tsx:107,148`;
  `subsystems.service.ts:105,135,161,198`; `ChatQuickTask.tsx:68`.
- DS icon set includes **`brain`** and **`dollar`** (`libs/design-system/src/assets/icons/index.ts:104`).
- **Test that WILL break:** `libs/contracts/src/subsystems/subsystems.contract.test.ts:44`
  — `expect(SUBSYSTEMS).toHaveLength(8)`.

### Ordered change list

1. `subsystem.schema.ts:9-18` — append `"codex"`, `"ledger"` to `SubsystemIdSchema`.
2. `subsystem.schema.ts:48-106` — append two `SUBSYSTEMS` entries:
   - `codex`: `name: "Codex"`, `tagline: "Paměť rodu"`, `mandate: "Správa paměti —
     vault, grounding, noční destilace a poličky znalostí."`, `color: "#c56fd4"`.
   - `ledger`: `name: "Ledger"`, `tagline: "Správce pokladny"`, `mandate: "Rozpočty
     a limity — stropy útrat, okna spotřeby, správa token-spend a limit-resume."`,
     `color: "#a9c23e"`.
   - Update the color-list doc comment at `:41-47`.
3. `agent.schema.ts` — add `ownerSubsystem: SubsystemIdSchema.optional()` to
   `AgentSchema` (doc comment mirrors `pipeline.schema.ts:139`). Frontmatter
   round-trip in `agents.storage.service.ts:138-183` (`fromFrontmatter`) and
   `:186-200` (`toFrontmatter`), guarded by `SubsystemIdSchema.safeParse`.
4. `integration.schema.ts` — add `ownerSubsystem: SubsystemIdSchema.optional()` to
   `IntegrationObjectSchema:143-168` and `CreateIntegrationObjectSchema:185-193`;
   verify the JSON store round-trips it.
5. `libs/contracts/src/index.ts` — confirm no new export needed.
6. `apps/web/features/subsystems/subsystemVisuals.ts:35-44` — add `codex: "brain"`,
   `ledger: "dollar"`.
7. `apps/web/features/chat/components/ChatQuickTask.tsx:41-50` — same two keys
   (keep the two tables in sync; collapsing the dup is out of scope).

### Test plan

- `subsystems.contract.test.ts:44` → `toHaveLength(10)`; add: registry contains
  `codex` + `ledger` with non-empty tagline/mandate and
  `new Set(colors).size === 10`.
- `agents.contract.test.ts`: `ownerSubsystem: "forge"` parses; `"not-a-subsystem"`
  fails; omitted stays valid (mirror `pipelines.contract.test.ts:186-212`).
- `integration.contract.test.ts`: same three assertions.
- Runner: `pnpm exec vitest run libs/contracts/src/subsystems libs/contracts/src/agents libs/contracts/src/integrations`.
  Phase gate: `pnpm test` + `pnpm check:deps`.

### Risks / gotchas

- **The two glyph maps are the whole compile risk.** After editing, verify with
  `grep -rn "Record<SubsystemId" apps libs`.
- Orb map needs no change; `SubsystemOrbMap.test.tsx` + `subsystemLoad.test.ts`
  should pass with 10 nodes.
- **Optional-in-contract justification:** required-in-schema would 400 every
  pre-F1b stored entity on read (schema is the read model too) and break fixtures.
  Optional in contract + write-time 422 in controllers (F1b) mirrors the existing
  `unprocessable()` pattern (`integrations.controller.ts:23,56,69`).

### Commit

`feat(contracts): seat codex + ledger, add ownerSubsystem to agent & integration`

---

## F1b — Seed mapping + write-time validation

### Goal

Idempotent one-shot startup backfill tagging stored entities; after backfill,
create without owner → **422**; unowned entities surfaced via a report route.

### Verified current state

- Proven startup-sweep pattern: `agents.storage.service.ts:54-57` (`onModuleInit` →
  `sweepInlineAvatars()`, impl `:228-251`) — per-file try/catch, atomic write,
  idempotent. Mirror this.
- Persistence: agents = `<id>.md` (`agents.storage.service.ts:34-46`,
  `MarkdownEntityStore`); integrations = `<id>.json` (`integration.schema.ts:171-176`);
  data dirs `.zibby/data/{agents,integrations,pipelines,chains}`.
- Write paths: `agents.controller.ts` create/update; `integrations.controller.ts:55-71`
  create; `unprocessable()` helper at `integrations.controller.ts:23`;
  violation-marker pattern `:177-181`.
- Health read-model is a **closed infra enum** (`health.schema.ts:21-26`) — not the
  place for ownership gaps.

### Ordered change list

1. **Pure mapping module** `apps/api/src/subsystems/owner-seed.ts` (no I/O):
   - Pipelines: `delivery`-role → `forge`; research-style (research /
     product-discovery / content / sales / code-audit) → `scout`; explicit,
     commented rule table. Chains → `scout`.
   - Agents: referenced by a delivery pipeline's `agent` phase → `forge`
     (server-side phase-walk).
   - Integrations (all kinds, incl. ci-stream monitors) → `puls`
     (`// TODO(F-herald): reply-capable → herald`).
   - codex/ledger: no rule (own nothing yet).
2. **Backfill service** `apps/api/src/subsystems/owner-backfill.service.ts`
   (`OnModuleInit`): for each store, tag untagged entities via `owner-seed.ts`
   through the store's `update`; skip already-owned; skip `undefined`; per-entity
   try/catch + `logger.warn`, never fatal to boot. Register in `subsystems.module.ts`.
3. **Write-time 422:** agents create without `ownerSubsystem` → 422 (helper +
   `MissingOwnerViolation` marker, mirroring integrations); same where an update
   would explicitly clear it. Integrations create: same guard alongside the existing
   kind-mismatch check. Partial updates omitting the field remain valid
   (omission = leave unchanged).
4. **Unowned report — DECISION: report list, not health.** `SubsystemsService.listUnowned()`
   → `GET /api/subsystems/unowned` (additive contract route). Post-backfill returns `[]`.

### Test plan

- `owner-seed.test.ts` (pure): delivery→forge; research/chain→scout; every
  integration kind→puls; unmatched→undefined; codex/ledger never assigned.
- `owner-backfill.service.test.ts`: temp dir fixtures untagged + tagged; run
  `onModuleInit` twice → idempotent; malformed file skipped not fatal.
- Controller tests: create without owner → 422; with owner → 201;
  `GET /subsystems/unowned` empty after backfill, lists offender before.
- Contract test: route shape in `subsystems.contract.test.ts`.
- Runner: `pnpm exec vitest run apps/api/src/subsystems apps/api/src/agents apps/api/src/integrations`; then `pnpm test`.

### Risks / gotchas

- Idempotency mandatory (`if (entity.ownerSubsystem) continue`).
- Backfill must run after each store's own dir-ensure — depend on storage services
  via DI so Nest orders init.
- Do NOT 422 partial updates that merely omit the field.

### Commit

`feat(api): backfill subsystem owners on boot and enforce owner at write`

---

## F1c — Stored roster

### Goal

`SubsystemsService` serves owned agents/integrations/monitors from stored tags;
delete client-side `deriveCrew`; `RosterTab` renders the stored roster with crew
rows navigating to `/agents/[id]`.

### Verified current state

- Derived-crew to delete: `RosterTab.tsx:122-135` (`deriveCrew`), invoked `:294`,
  rendered `:302-309`; `CrewRow` `:144-175` static by design (`:143`).
- Agent detail route exists: `apps/web/app/(dashboard)/agents/[id]/page.tsx`.
- Contract: `SubsystemWithStatusSchema` (`subsystem.schema.ts:123-128`) — no roster.
- `SubsystemsService.aggregateAll()` (`subsystems.service.ts:146-213`) loads
  pipelines/chains only; no agents/integrations injected yet.
- Web queries available: `useAgentsQuery`, `useChainsQuery`, `usePipelinesQuery`
  (`RosterTab.tsx:13-31`).

### Ordered change list

1. **Contract** — `SubsystemRosterSchema` (agents/integrations/monitors as minimal
   refs) behind a **dedicated route** `GET /api/subsystems/:id/roster` (keeps the
   strip payload lean; mirror route shape `subsystems.contract.ts:25-39`).
2. **Service** — inject `AgentsStorageService` + `IntegrationsStorageService`;
   `roster(id)` filters by `ownerSubsystem === id`; monitors = owned integrations
   with `streams.includes("ci")`. Pipelines/chains stay client-filtered (canvas
   already has them).
3. **Web query** — `useSubsystemRosterQuery(id)` (mirror existing subsystem queries).
4. **RosterTab** — delete `deriveCrew` + call; source crew from roster query;
   `CrewRow` wrapped in `Link href={/agents/${id}}` (DS primitives, testid enum);
   add integrations/monitors sections.
5. Remove dead imports if `deriveCrew` was sole consumer (keep `agents` for
   `phasesToGraph`).

### Test plan

- Service test: seeded fixtures → `roster("forge")` exact match; empty for
  codex/ledger; counts match fixture.
- Contract test: roster route shape.
- `RosterTab.test.tsx`: stored-roster assertions; anchor to `/agents/<id>` via
  `RosterTabTestId.CrewRow` (`:42`); delete `deriveCrew` tests.
- Runner: `pnpm exec vitest run apps/api/src/subsystems`,
  `pnpm exec vitest run apps/web/features/subsystems`; then `pnpm test` + `pnpm check:deps`.

### Risks / gotchas

- `deriveCrew` is exported — grep for other importers before deleting.
- Module wiring: export storage services from their modules, import into
  `subsystems.module.ts` (leaf services, no cycle expected).
- Navigation via Next `Link`, not raw `<a>`.

### Commit

`feat(subsystems): serve stored roster and make the crew navigable`

---

## Sequencing & global gotchas

F1a → F1b → F1c strictly ordered. After each: scoped tests green, checkpoint
commit; `pnpm test` + `pnpm check:deps` at phase end. The duplicated
`SUBSYSTEM_GLYPH` tables are the single most likely miss — verify with
`grep -rn "Record<SubsystemId" apps libs` after F1a.

Critical files:

- `libs/contracts/src/subsystems/subsystem.schema.ts`
- `apps/api/src/subsystems/subsystems.service.ts`
- `apps/api/src/agents/agents.storage.service.ts`
- `apps/api/src/integrations/integrations.controller.ts`
- `apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx`

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with one correction the implementer MUST include:

- **F1b gap — the web create forms.** Enforcing 422 on create-without-owner breaks
  the existing NewAgent dialog and integration create form, which have no owner
  field. F1b therefore ALSO adds an `ownerSubsystem` select (DS `SelectField`,
  options from `SUBSYSTEMS`, labelled cs+en via i18n) to:
  - the agent create dialog/form in `apps/web` (locate the NewAgent dialog/form),
  - the integration create dialog (`useIntegrationFormState`/`IntegrationFormFields`).
    Default preselect: `forge` for agents, `puls` for integrations (matches the seed
    map). Update create-mutation payloads + form tests accordingly. Without this the
    operator cannot create entities from the UI after F1b lands.
- Premise corrections (monitors = ci-stream integrations; all integrations seed to
  puls with `TODO(F-herald)`; codex/ledger rosters legitimately empty) are ACCEPTED.
