# F2 — Two-Stage Dispatch: Switchboard → Subsystem Brain — Implementation Plan

> NS2 phase F2. Planned by Opus, reviewed + APPROVED unchanged by orchestrator.
> Branch `north-star-2`. Built ON TOP of F1's end state (registry = 10 ids;
> Agent + Integration carry `ownerSubsystem`; stored rosters served). Contract-first,
> tests = DoD, vitest, per-package `tsc -p`, no `any`. Subphases: **F2a → F2b → F2c**,
> strictly ordered, one commit each.

## Premise corrections (verified — read first)

1. **"Remove the isCoherent guard" is only ~⅓ of F2a.** The LLM router is
   structurally incapable of a subsystem verdict: `RouterVerdict.targetKind` is
   `"agent" | "pipeline"` (`claude-cli-router.ts:33-43`), prompt catalog lists only
   agents/pipelines (`:110-117`), `chosen` lookup rejects non-candidates (`:80-88`),
   and `RoutableTarget = CatalogTaskTarget & {search}` with
   `CatalogTaskTarget = Extract<TaskTarget,{kind:"agent"|"pipeline"}>`
   (`task.schema.ts:117`, `task-router.ts:11`). F2a must widen candidate type,
   verdict, prompt AND `toTaskTarget`.
2. **Empty-roster fallback half-wired but dishonest.** A subsystem target reaching
   `dispatch()` falls through to the orchestrator fallback (`task-scheduler.service.ts:1150-1176`)
   but never runs stage-2 AND persists the raw subsystem target (`:1175`) — a lie.
   F2a inserts stage-2 resolution + rewrites to `ORCHESTRATOR_TARGET` when empty.
3. **`SubsystemEmptyRosterError` stays on the EXPLICIT path only** (`:385-406`,
   422 via `tasks.controller.ts:35`). Switchboard path must fall back to
   orchestrator instead. Extract a shared `…OrNull` core; each caller chooses.
4. **Stage-2 catalog needs a signature change:** `classifyWithinSubsystem(input, subsystemId)`
   (drop `ownedPipelineIds`) — builds catalog internally from pipelines + agents stores.
5. **No prompt seam exists.** Router system prompt is a frozen constant
   (`claude-cli-router.ts:17-31`); add optional `preamble` to `TaskRouter.route`
   (`task-router.ts:36-38`) → `buildPrompt`; `KeywordScorer.route` ignores it.
6. **Classification renders NOWHERE in web today.** Surface via the established
   `enrichRunWithTask` pattern (`task-runs.service.ts:547-571`) onto `TaskRun`,
   rendered in `RunDetail` (it IS the detail surface — no new dialog).

---

## F2a — Switchboard emits subsystem verdicts

**Goal:** undirected tasks may classify to `{kind:"subsystem", id}`; verdict flows
through soft stage-2 in `dispatch()`; empty roster → orchestrator (never a hard
error). Explicit `@mention` path untouched.

**Decisions (justified):**

- **Stage-1 candidates = only subsystems with ≥1 owned pipeline** (F2b widens to
  pipelines-or-agents). Offering codex/ledger (own nothing until F4/F5) invites
  verdicts that immediately unwind — wasted tokens, misleading trace. The
  empty-roster safety net still exists for the classify→dispatch race.
- **Keyword scorer extended for free, zero scorer change:** `KeywordScorer.score`
  (`keyword-scorer.ts:81-129`) ranks whatever candidates it gets; subsystem
  candidates carry `search` = mandate, so mandate-term overlap ranks them. One
  candidate list, one ranking path, deterministic in e2e (VITEST guard nulls the
  LLM router).
- **Empty-roster switchboard verdict → orchestrator in `dispatch()`:** extract
  `resolveSubsystemTargetOrNull(target,text,paths): Promise<TaskTarget|null>`
  (0 → null; 1 → `pipelineTaskTarget`; N → `classifyWithinSubsystem`). Explicit
  wrapper throws `SubsystemEmptyRosterError` on null (422 unchanged); switchboard
  uses `?? ORCHESTRATOR_TARGET`.

**Verified state:** `isCoherent` `task-classifier.service.ts:305-311`;
`buildCandidates` `:254-273`; `pipelineCandidates` `:281-291`; `toTaskTarget`
`task-router.ts:16-25`; router verdict/prompt/lookup `claude-cli-router.ts:33-43,110-117,80-88`,
VITEST guard `:66`; classify call in dispatch `task-scheduler.service.ts:1092-1098`;
orchestrator fallback `:1150-1176`; `resolveSubsystemTarget` `:385-406`, call site
`:323-325`; `SubsystemEmptyRosterError` `:74-79`; `ORCHESTRATOR_TARGET`
`task.schema.ts:126-130`.

**Changes (ordered):**

1. `task-router.ts` — `RoutableTarget = (CatalogTaskTarget | Extract<TaskTarget,{kind:"subsystem"}>) & {search: string}`;
   `toTaskTarget` gains a type-safe `subsystem` case.
2. `claude-cli-router.ts` — `RouterVerdict.targetKind` gains `"subsystem"`; system
   prompt documents subsystem rows (delegation semantics; "targetId MUST be in
   catalog" rule stays); `parseVerdict` (`:143-157`) accepts `"subsystem"`;
   `buildPrompt` + `chosen` unchanged (kind-generic already).
3. `task-classifier.service.ts` — `isCoherent`: remove only `subsystem` from the
   rejection list (keep orchestrator/goal/chain; the trailing candidate-membership
   check validates seated ids). `buildCandidates`: append, per `SUBSYSTEMS` entry
   owning ≥1 pipeline (computed from listed pipelines' `ownerSubsystem`),
   `{kind:"subsystem", id, name, glyph:"orbit", search: mandate}`. Stage-2
   (`classifyWithinSubsystem`) NEVER offers subsystems.
4. `task-scheduler.service.ts` — extract `resolveSubsystemTargetOrNull`; keep
   `resolveSubsystemTarget` as explicit wrapper (throw on null); in `dispatch()`
   after `target = routing.target` (`:1094-1097`): if subsystem →
   `target = (await resolveSubsystemTargetOrNull(...)) ?? ORCHESTRATOR_TARGET`.

**Tests:** classifier — subsystem candidate offered iff owns a pipeline (codex/ledger
excluded); `isCoherent` accepts seated subsystem verdict, still rejects
orchestrator/goal/chain/unseated; keyword leg ranks mandate-overlap top. Scheduler —
subsystem verdict + non-empty roster dispatches to owned pipeline (assert
`markDispatched` kind `"pipeline"`); empty-roster verdict → `startOrchestrator`,
persists `ORCHESTRATOR_TARGET`, records `orchestrator-fallback` (named test);
explicit `@codex` still throws → 422.
Run: `pnpm exec vitest run apps/api/src/tasks/task-classifier.service.test.ts apps/api/src/tasks/task-scheduler.service.test.ts`
+ `tsc -p apps/api` + `tsc -p libs/contracts`.

**Gotchas:** RoutableTarget widening blast radius — after widening,
`grep -rn "RoutableTarget\|CatalogTaskTarget" apps/api/src libs/contracts`, confirm
exhaustiveness via tsc. Honest persistence — assert persisted target kind. `glyph:"orbit"`
must exist as DS IconName (verify `libs/design-system/src/assets/icons/index.ts`).

**Commit:** `feat(tasks): switchboard classifier emits subsystem verdicts with soft orchestrator fallback`

---

## F2b — Per-subsystem dispatcher brain

**Goal:** stage-2 routes within owned pipelines + owned agents, driven by a
mandate-derived per-subsystem prompt and per-subsystem fallback policy.

**Decisions:**

- Signature: `classifyWithinSubsystem(input, subsystemId)`.
- Fallback policy table `SUBSYSTEM_FALLBACK: Record<SubsystemId, "orchestrator"|"primary">`:
  forge → orchestrator (delivery specialists; low-confidence better self-delegated);
  scout/herald/puls/sentinel/maestro/beacon/loom → primary owned pipeline (first by
  registry/file order); codex/ledger → orchestrator. Typed Record = exhaustiveness
  discipline (future ids fail tsc).
- Roster for 0/1/N = pipelines + active agents; exactly 1 unit → direct dispatch
  (no classify round-trip); F2a's stage-1 candidate filter widens to
  "owns ≥1 pipeline OR ≥1 active agent".

**Verified state:** `classifyWithinSubsystem` `:89-104`; route fallback `:113-150`;
`pipelineCandidates` `:281-291`; agent projection in `buildCandidates` `:262-270`;
`listActive` used at `:257`; prompt seam refs above; mandate source
`subsystem.schema.ts:48-106`.

**Changes (ordered):**

1. `task-router.ts` — public `TaskRouter.route` gains optional `preamble` (extend
   the internal fallback-opts object).
2. `claude-cli-router.ts` — `buildPrompt` injects preamble between
   `ROUTER_SYSTEM_PROMPT` and `TASK:` (`SUBSYSTEM MANDATE: <mandate>`);
   `KeywordScorer.route` accepts/ignores (signature parity).
3. `task-classifier.service.ts` — `subsystemCandidates(subsystemId, pipelines, agents)`
   = owned pipelines + owned active agents (factor the agent→candidate projection
   out of `buildCandidates` so both compute identical search/glyph). Rewrite
   `classifyWithinSubsystem`: build catalog, compose preamble (mandate + owned-unit
   `name — desc` list), `route(input, candidates, {fallback: policy, preamble})`,
   enrich. `"primary"` → `toTaskTarget(candidates[0])`; null only on empty catalog.
4. `task-scheduler.service.ts` — `resolveSubsystemTargetOrNull` counts
   pipelines+agents; 1 unit → direct target (`pipelineTaskTarget` or new
   `agentTaskTarget` helper); ≥2 → `classifyWithinSubsystem({text,paths}, id)`.
   Widen F2a's stage-1 candidate filter accordingly.

**Tests:** catalog = pipelines+agents (1+1 → 2 candidates; agent-shaped task routes
to agent); preamble reaches router (routeSpy third-arg contains mandate); fallback:
forge+silentRouter+non-matching → ORCHESTRATOR_TARGET, scout+same → first owned
pipeline; scheduler: single-agent subsystem → direct dispatch, 2 units →
classifyWithinSubsystem invoked. Update Phase-91 tests calling the old signature
(only caller is `resolveSubsystemTargetOrNull` — grep first).
Same run commands as F2a.

**Commit:** `feat(tasks): per-subsystem dispatcher brain with owned agents, mandate prompt, fallback policy`

---

## F2c — Classification trace + activity tagging

**Goal:** task persists both verdicts (switchboard→subsystem→unit); dispatch
activity carries owning subsystem; RunDetail renders the trace minimally.

**Decisions:** trace = stage-1 verdict (terminal unit already lives in
`task.target`): `ClassificationTraceSchema` { stage1: TaskTargetSchema, confidence
0-1, reason, matchedTerms[], subsystem?: SubsystemId } — optional/additive.
Activity: `ownerSubsystem: SubsystemIdSchema.optional()` added to the deliberately
`.strict()` `ActivityRefsSchema` (`activity.schema.ts:91-122`). Web = enrich
`TaskRun` + render in `RunDetail` (no new dialog).

**Verified state:** `ScheduledTaskSchema` optional cluster `task.schema.ts:374-423`
(target `:381-382`); `dispatch()` returns `{runRef,target}` consumed by
`persistDispatched` `:1179-1197`, `dispatchPending` `:775-797`, `attemptDispatch`
`:882-907` — **three call sites**; `markDispatched` in
`scheduled-tasks.storage.service.ts`; `recordDispatchedActivity` `:1218-1234`;
`refForTarget` `:1534-1544`; `TaskRunSchema` enriched fields
`task-run.schema.ts:88-108`; `enrichRunWithTask` `task-runs.service.ts:547-571`;
web renders classification nowhere (`RunView = TaskRun`, `run.ts:15`).

**Changes (ordered):**

1. `task.schema.ts` — `ClassificationTraceSchema` + `classification` optional on
   `ScheduledTaskSchema`; export type.
2. `activity.schema.ts` — `ownerSubsystem` optional on `ActivityRefsSchema`.
3. `task-run.schema.ts` — `classification` optional on `TaskRunSchema` (doc-commented
   enriched-from-task).
4. `task-scheduler.service.ts` — `dispatch()` builds `classification` from `routing`
   + resolved subsystem id, returns `{runRef, target, classification?}` (explicit
   path → none); thread into `markDispatched` (additive signature) and
   `recordDispatchedActivity` at ALL THREE call sites;
   `refs.ownerSubsystem = classification?.subsystem ?? unit's ownerSubsystem`
   (best-effort store read, guarded).
5. `scheduled-tasks.storage.service.ts` — persist `classification`.
6. `task-runs.service.ts` — enrich `classification` in `enrichRunWithTask`.
7. `RunDetail.tsx` — minimal trace block (DS Stack/Typography/Badge, testid enum):
   `Switchboard → <subsystem> → <unit>` + reason + confidence; reuse `task.ts`
   target-label helpers (`:87,194`); narrow free-form glyph to IconName on receipt.

**Tests:** contracts — classification parses/omissible on ScheduledTask+TaskRun;
ActivityRefs accepts ownerSubsystem, still strict-rejects unknown keys (extend the
`:26-27` negative test). Scheduler — two-stage dispatch persists
`stage1.kind==="subsystem"`, `subsystem==="forge"`, `target.kind==="pipeline"`;
activity carries `refs.ownerSubsystem`. task-runs — enrichment. RunDetail — trace
renders with classification, absent otherwise.
Run: `pnpm exec vitest run libs/contracts/src/tasks libs/contracts/src/activity apps/api/src/tasks apps/web/features/runs/components/RunDetail.test.tsx`
+ all three tsc. Phase end: `pnpm test` + `pnpm check:deps` (ignore 2 known
pipelines.e2e failures).

**Gotchas:** the three dispatch call sites (grep
`markDispatched\|recordDispatchedActivity` in the scheduler); keep the `.strict()`
diff to the one field; classification is read-model-only on TaskRun (never
client-written).

**Commit:** `feat(tasks): persist classification trace and tag dispatch activity with owning subsystem`

---

## Sequencing

F2a → F2b → F2c. After each: scoped vitest + per-package tsc, checkpoint commit;
phase end `pnpm test` + `pnpm check:deps`. Biggest risks: three dispatch call sites
(F2c), RoutableTarget widening exhaustiveness (F2a). Update
`docs/ns2/PROGRESS.md` rows to ✅ with shas as each lands. All commits end with the
standard Co-Authored-By + Claude-Session footers.

Critical files: `apps/api/src/tasks/task-classifier.service.ts`,
`apps/api/src/tasks/claude-cli-router.ts`, `apps/api/src/tasks/task-scheduler.service.ts`,
`libs/contracts/src/tasks/task.schema.ts`, `apps/api/src/tasks/task-runs.service.ts`.
