# F3 — Subsystem Policy & Accountability — Implementation Plan

> NS2 phase F3. Planned by Opus, reviewed + APPROVED unchanged by orchestrator.
> Branch `north-star-2`. Built on F1+F2 end state (10 ids; ownerSubsystem on
> Agent/Integration; stored rosters; subsystem verdicts; ClassificationTrace on
> ScheduledTask/TaskRun; ActivityRefsSchema.ownerSubsystem from F2c). Contract-first,
> tests = DoD, vitest, per-package `tsc -p`, no `any`, DS + testid enums, i18n cs+en.
> Subphases **F3a → F3b → F3c**, one commit each.

## Premise corrections (verified — read first)

1. **Gate catalog is NOT wired into runtime evaluation today.** `ownerSubsystem` on
   rules is attribution-only ("the gate evaluation engine … never reads this field",
   `gate.schema.ts:162-170`); `GateEvaluatorService` reads only the locked floor +
   the agent's own `gates` (`gate-evaluator.service.ts:60-64,143-159`);
   `GateRulesStorageService` has zero server-side evaluation consumers. **F3a makes
   subsystem-tagged catalog rules load-bearing for the first time** — rewrite the
   doc comments at `gate.schema.ts:162-170` and `GatesTab.tsx:190-213`.
2. **There is NO "project rules" gate layer.** Project autonomy_policy is prose
   grounding (`project-vault.service.ts:80-86`, `channel-triage-flow.service.ts:297-301`),
   never evaluated. The evaluator has two buckets (agent-own vs floor by
   `rule.locked`); F3a inserts a third "subsystem" bucket between them.
3. **Harden-only is automatic at eval time** — a third bucket combined via
   `DECISION_RANK` max can only tighten. `validateHardenOnly` extension is a
   write-time UX nicety (422), never the security boundary.
4. **Acting subsystem derives from the owned unit** (pipeline stage →
   `pipeline.ownerSubsystem` `pipeline-runner.service.ts:1619-1625`; agent run →
   `agent.ownerSubsystem` `agent-runner.service.ts:497`), NOT from the F2c
   classification (the executing unit is the authoritative actor).
5. **F2c owns the activity-schema change** (`refs.ownerSubsystem`) — F3c consumes
   it, never re-adds it.
6. **Web gate scaffolding mostly exists (Phase 87):** `GateRulesSection` already
   filters/auto-tags by `ownerSubsystem` (`GateRulesSection.tsx:36-64,105-120`);
   only `GlobalRuleCard` (`:74-113`) misses the owner tag display.
7. **`get_status` takes no args; ChatToolsService lacks SubsystemsService**
   (`chat-mcp.controller.ts:148-158`, `chat-tools.service.ts:31-36`).
8. **"Tier defaults" have no data-model home** (`SubsystemSchema` identity-only) →
   static exhaustive `SUBSYSTEM_TIER_DEFAULT: Record<SubsystemId, Decision | null>`
   in contracts (mirrors F2b's `SUBSYSTEM_FALLBACK`; operator-editable defaults
   deferred).

---

## F3a — Per-subsystem gate-rule sets + tier defaults

**Goal:** subsystem-tagged catalog rules become a third evaluation bucket between
the agent's own rules and the locked floor, applying ONLY to runs of units owned by
that subsystem; static tier default per subsystem (catch-all decision) rides the
same bucket; harden-only structural + write-time 422; `/gates` card shows owner
scope.

**Decisions:** strictest-of-three-buckets (own ∪ subsystem ∪ floor) via
`DECISION_RANK` max — provably harden-only; scoping by loading only the acting
subsystem's rules; acting subsystem = owned unit's `ownerSubsystem`; v1 scope =
agent-run (non-orchestrator) + pipeline-stage paths only — `evaluateForOrchestrator`
(`:108-122`) and floor-only call sites (`agent-proposal-flow.service.ts:88`,
`task-scheduler.service.ts:941`) unchanged (documented boundary); bucket
discrimination via new `source: "subsystem"` enum value; tier default table all
`null` except `beacon → "ask"` (mandate = Tier-3 escalation) appended as
`{type:"context", context:"*"}` catch-all.

**Verified state:** `GateRuleSchema.source` enum + `locked` `gate.schema.ts:89-99`;
`GlobalGateRuleBaseSchema.ownerSubsystem` `:170`; evaluator: `floor()` `:52-54`,
`ownRules()` `:67-88`, `matchOnce()` `:143-159`, `validateHardenOnly()` `:187-208`,
`provablyDisjoint()` `:269-323`; `GateRulesStorageService.list()`
`gate-rules.storage.service.ts:44-56`; eval sites `agent-runner.service.ts:491-514`,
`pipeline-runner.service.ts:1614-1630`; `DECISION_RANK` `gates/decision-rank.ts`;
web `GlobalRuleCard.tsx:57-113`.

**Changes (ordered):**

1. `gate.schema.ts` — `"subsystem"` into `source` enum (`:91`); rewrite
   `ownerSubsystem` doc (`:162-170`); add exported
   `SUBSYSTEM_TIER_DEFAULT: Record<SubsystemId, Decision | null>` (all null except
   `beacon: "ask"`).
2. `gate-evaluator.service.ts` — inject `GateRulesStorageService` (`@Optional()`,
   absence = empty bucket, keeps `new GateEvaluatorService(policy)` test path);
   `subsystemRules(id)` = catalog filtered by owner, mapped
   `{...core, source:"subsystem", locked:false}` + tier-default catch-all;
   `rulesForAgentInSubsystem(input, subsystemId?)` = own + subsystem + floor;
   generalize `matchOnce` to three buckets keyed by `source` (strictest non-null
   winner; fail-closed `ask` when all null; two-bucket semantics preserved exactly);
   `validateSubsystemRuleHardenOnly(floor, rule)` helper reusing
   provablyDisjoint + DECISION_RANK.
3. `gates.module.ts` — import `GateRulesModule` (no cycle: gate-rules depends on
   nothing in gates).
4. `agent-runner.service.ts` — non-orchestrator branch (`:514`) evaluates with
   `rulesForAgentInSubsystem(agentInput, agent.ownerSubsystem)`.
5. `pipeline-runner.service.ts` — `evaluateStageIntent` (`:1626-1630`) uses
   `rulesForAgentInSubsystem({gates, requires_approval}, pipeline.ownerSubsystem)`.
6. `gate-rules.controller.ts` — create/update with `ownerSubsystem` set → run
   `validateSubsystemRuleHardenOnly`, 422 on weakening. IF injecting the evaluator
   creates a module cycle (gates→gate-rules just added), DROP the write-time 422
   and keep eval-time-only (structural guarantee holds) — decide by `tsc`,
   document the outcome.
7. `GlobalRuleCard.tsx` — DS `Tag` with `SUBSYSTEM_GLYPH` glyph + `SUBSYSTEMS` name
   when `rule.ownerSubsystem` present; testid on the tag.
8. i18n — cs+en for any new label (none needed if the Tag shows the subsystem name).

**Tests:** contracts — `source:"subsystem"` parses; tier-default table has 10 keys,
only beacon non-null. Evaluator — three-bucket matrix (subsystem ask + floor notify
→ ask; subsystem notify + floor ask → ask; no subsystem id → identical to two-bucket
result [regression lock]; beacon catch-all hardens pr.open to ask;
`subsystemRules("forge")` only forge rules). Runner — forge-tagged rule fires on
forge-owned run, NOT on puls-owned run (scope proof). Controller — weakening tagged
rule → 422 (if kept). Web — owner tag renders iff set.
Run: `pnpm exec vitest run libs/contracts/src/gates apps/api/src/gates apps/api/src/gate-rules apps/web/features/gates` + three tsc.

**Gotchas:** don't touch `evaluateForOrchestrator`; grep
`source ===\|case "system"\|case "agent"` after the enum widening; `matchOnce` IS
the security boundary — existing two-bucket tests must pass unchanged; `@Optional()`
the catalog dep.

**Commit:** `feat(gates): subsystem-scoped gate-rule bucket + tier defaults, harden-only`

---

## F3b — Briefing per subsystem

**Goal:** additive per-subsystem grouping in the briefing ("Forge: 2 PRs čekají ·
Puls: CI zelené · Ledger: 62 % týdenního okna"), rendered on the overview
BriefingCard; old briefings still parse.

**Decisions:** source lines from `SubsystemsService.list()` (state + tier2/tier3
counts, `subsystems.service.ts:103-113,146-213`); Ledger note = weekly usage window
% from `LimitsService.snapshot().weekly.usedPct` (`limits.service.ts:61-63`);
Beacon honored via its tier3Count line; `assembleBriefing` stays PURE (service
gathers, assembly formats — mirrors `ciStatuses` pattern
`briefing.service.ts:60-109`); new optional `subsystems?: BriefingSubsystemLine[]`
on `BriefingSchema` with per-line optional `note`.

**Verified state:** `BriefingSchema` optional-extras pattern
`briefing.schema.ts:85-105`; `assembleBriefing` pure `briefing-assembly.ts:68-112`,
`BriefingInput` `:16-48`; service gather `briefing.service.ts:58-110` (no
SubsystemsService/LimitsService injected yet; no cycles — verified deps);
web `BriefingCard.tsx:43-145`, testid enum `:11-18`, i18n `overview.*`.

**Changes (ordered):**

1. `briefing.schema.ts` — `BriefingSubsystemLineSchema` {subsystem, name, state,
   tier2Count, tier3Count, note?} + `subsystems` optional array on `BriefingSchema`.
2. `briefing-assembly.ts` — `subsystems?` on `BriefingInput`; conditional spread;
   optional `## Subsystems` block in `renderBriefingMarkdown`.
3. `briefing.service.ts` — inject `SubsystemsService` + `LimitsService`; gather in
   `Promise.all` (`.catch()`-guarded like ciStatuses); build lines (ledger note =
   `${weekly.usedPct} % týdenního okna`; puls note from gathered ciStatuses);
   pass to assembly.
4. `briefing.module.ts` — import `SubsystemsModule` + `LimitsModule` (verify
   exports; no cycle at boot).
5. `BriefingCard.tsx` — compact DS Stack of rows (glyph+name+count/note,
   StatusDot/Tag by state); `BriefingCardTestId.SubsystemLine`.
6. i18n cs+en — section title + count phrasing.

**Tests:** contract — subsystems parses/omissible; assembly — present ⇄ absent
snapshot; service — fixture counts match, ledger pct note, read-failure → lines
omitted but briefing assembles; web — lines render with testids, absent when
missing.
Run: `pnpm exec vitest run libs/contracts/src/briefing apps/api/src/briefing apps/web/features/overview` + three tsc.

**Gotchas:** assembly stays pure (no service injection); hot-path reads
`.catch()`-guarded; strictly additive to existing briefing shapes.

**Commit:** `feat(briefing): per-subsystem grouping lines (Beacon needs-you, Ledger window)`

---

## F3c — Approvals/activity filters + chat get_status per subsystem

**Goal:** approvals carry optional `ownerSubsystem` (stamped at request time from
the acting unit); approvals queue + activity list filterable by subsystem; chat
`get_status` answers per subsystem.

**Decisions:** additive optional `ownerSubsystem` on `ApprovalSchema`, set at
`requestApproval` — only run-path callers populate it (pipeline-runner `:1661` from
`pipeline.ownerSubsystem`; agent-runner `:535` from `agent.ownerSubsystem`); the
other 5 call sites (machine/jira/channel/agent-proposal/budget-task) omit — never
invent an owner. Activity filter is client-side over F2c's `refs.ownerSubsystem`.
`get_status` gains optional `subsystem` arg → `SubsystemsService.get(id)` + recent
owner-tagged activity; no arg = today's global summary. Web filter = overview
`ApprovalsPanel` DS `ButtonGroup` (deselectable, pattern
`GateRulesSection.tsx:127-138`).

**Verified state:** `ApprovalSchema` `approval.schema.ts:59-73` (no subsystem);
`RequestApprovalInput` + `requestApproval` `approvals.service.ts:22-30,61-91`;
7 call sites (task-scheduler `:945`, agent-runner `:535`, pipeline-runner `:1661`,
agent-proposal `:109`, machine `:86`, jira `:61`, channel-triage `:368`); chat
`getStatus()` `chat-tools.service.ts:89-92`, MCP registration
`chat-mcp.controller.ts:148-158`, `describeTarget` handles subsystem `:154-155`;
`SubsystemsService.get(id)` `subsystems.service.ts:116-120`; web
`ApprovalsPanel.tsx:24-62` (no testid enum yet), `ActivitySection.tsx`.

**Changes (ordered):**

1. `approval.schema.ts` — `ownerSubsystem: SubsystemIdSchema.optional()` with doc.
2. `approvals.service.ts` — optional field on `RequestApprovalInput`, threaded into
   the record + best-effort into `approval-requested` activity refs (`:80-89`).
3. `pipeline-runner.service.ts:1661` + `agent-runner.service.ts:535` — pass the
   unit's owner. Other call sites unchanged.
4. `chat-tools.service.ts` — inject `SubsystemsService`;
   `getStatus(subsystem?: SubsystemId)` — per-subsystem Czech answer (state +
   counts + recent owner-tagged activity); no arg unchanged.
5. `chat-mcp.controller.ts:148-158` — `inputSchema: {subsystem: optional enum from
   SUBSYSTEMS ids}` (never hard-code the list); forward; expand description
   ("co dělá Forge?"). Import `SubsystemsModule` into the chat module (no cycle).
6. `ApprovalsPanel.tsx` — `ApprovalsPanelTestId` enum + deselectable `ButtonGroup`
   filter (only subsystems with ≥1 pending), client-filter by `a.ownerSubsystem`.
7. `ActivitySection.tsx` — client-side subsystem ButtonGroup over
   `entry.refs.ownerSubsystem`; testid.
8. i18n cs+en — filter labels + get_status phrasing.

**Tests:** contract — field parses/omissible; approvals service — persists +
activity-stamps when given, absent otherwise; chat — `getStatus("forge")` mentions
forge state/counts (mock), `getStatus()` unchanged; web — both filters narrow;
"vše" shows all.
Run: `pnpm exec vitest run libs/contracts/src/approvals apps/api/src/approvals apps/api/src/chat apps/web/features/overview apps/web/features/settings` + three tsc.

**Gotchas:** never touch `ActivityRefsSchema` here (F2c owns it — if the field is
missing, that's a sequencing bug: flag, don't patch); additive-only on
`ApprovalSchema`; source the MCP enum from `SUBSYSTEMS`.

**Commit:** `feat(approvals): tag approvals by owning subsystem; filters + per-subsystem get_status`

---

## Sequencing

F3a → F3b → F3c. After each: scoped vitest + three tsc, checkpoint commit; phase
end `pnpm test` + `pnpm check:deps` (ignore 2 known pipelines.e2e fails). Biggest
risks in order: (1) `matchOnce` three-bucket refactor — regression-lock existing
tests unchanged; (2) `source` enum exhaustiveness; (3) module wiring cycles
(gates←gate-rules, briefing←subsystems+limits, chat←subsystems) — all verified
one-directional, confirm at boot. Update `docs/ns2/PROGRESS.md` rows with shas.
All commits end with the standard footers.

Critical files: `apps/api/src/gates/gate-evaluator.service.ts`,
`libs/contracts/src/gates/gate.schema.ts`, `apps/api/src/briefing/briefing.service.ts`,
`apps/api/src/approvals/approvals.service.ts`, `apps/api/src/chat/chat-tools.service.ts`.
