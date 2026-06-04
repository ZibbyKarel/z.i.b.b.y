# z.i.b.b.y — Roadmap Implementation Plan (Phases 2b → 6)

## Context

`NEXT-STEPS.md` is a **spec**, not a plan — it asks Claude Code to turn the
roadmap into a concrete, sequenced implementation. The goal is to take z.i.b.b.y
from its current state (only `agents`/`categories`/`agent-runs`/`health`/`limits`
exist on the backend; `skills`/`pipelines`/`integrations`/approvals/activity are
frontend mocks in `useCatalog`) to the "final" autonomous-orchestrator vision:
real execution for skills & pipelines, an approval gate + policy engine that
guarantees ZIBBY never autonomously completes a transactional action, a live
memory layer, cron/event automations, and a robust real executor.

**Decisions taken (confirmed with user):**

- Execute **all phases on one branch** (`claude/amazing-brahmagupta-6njME`), landing as one large body of work.
- **Adopt the roadmap's recommended defaults**: generalize a shared `RunnerCore`; keep Phase 3 minimal (Variant A, phase-boundary gate) then layer the 3.5 policy engine (`POLICY.md` floor, Variant B `INTENT` protocol) on top.
- Playwright covers four UI throughlines (pipeline+phase-chain, approval, skill run, memory graph); add more critical paths at the end.

**Ground-truth corrections discovered during exploration (these change the recipe):**

1. **New resources register in TWO places**, not one: `libs/contracts/src/app.contract.ts` (`appContract` router) **and** `apps/api/src/main.ts` (`apiContract` for `/docs`). Every new resource touches both.
2. **`gate.schema.ts`/`gate.contract.ts` do NOT exist** (roadmap hedged that they might). Phase 3.5 builds them from scratch.
3. **`AgentRunnerService` lives in `AgentsModule`** (not its own module), built with DI tokens `RUNS_DIR` + injected `AgentsStorageService`. The `RunnerCore` extraction must preserve this wiring or the full-`AppModule` e2e breaks.
4. **No Playwright is installed** — it is added from scratch as a 6th project, kept out of the existing 5-project `vitest.workspace.ts`.

**Hard invariants (must not break):** contract-first (Zod → `c.router` → `@ts-rest/nest`, no codegen); Markdown storage-service pattern (`resolveFile` regex+containment guards, `writeAtomic` tmp+rename, tolerant `tryParse`); runner pattern (spawn → `<runId>.log` + `<runId>.json` sidecar, `PROGRESS <n>`, restart reconstruction); **ZIBBY never autonomously completes a transactional action**; DS-first frontend (no app Tailwind, no `forwardRef`, no `any`, query hooks per-domain with `select: selectApiResponseBody`); polling not SSE; after every code change run `npm run lint && npm run typecheck && npm run test` green.

---

## Phase 2b — Execution for `skills` & `pipelines`

### 2b-1 — Extract `RunnerCore` (do FIRST; highest-risk)

Lift the spawn/log/sidecar/reconcile machinery out of `agent-runner.service.ts` into a kind-agnostic class parameterized by a strategy. **Keep `AgentRunnerService`'s public surface byte-identical** so `apps/api/test/agent-runs.e2e.test.ts` passes unchanged.

New files under `apps/api/src/runner/`:

- `runner-core.types.ts` — `RunKind = "agent" | "skill" | "pipeline-stage"`; `BaseRun` (`runId, kind, status, pct, cwd, startedAt, pid, logFile, pgid?`); `RunSpec` (`kind, ownerId, command, args, cwd, extra`); `KindStrategy<R>` (`assemble`, `schema`, optional `onLine` hook).
- `runner-core.ts` — `RunnerCore<R extends BaseRun>` with `init()` (was `onModuleInit`: rebuild + reconcile), `shutdown()`, `start(spec)`, `list()`, `get()`, `stop()`, `readLog()`. Lift verbatim: `RUN_ID_REGEX` + path-containment guard, retention window/`MAX_LISTED`, `PROGRESS <n>` scan, `running → interrupted` reconcile, ENOENT-tolerant `readLog`, optional injected `gate?: GatePort` (unused until 3.5).
- `runner-core.test.ts` — clone of storage-test style (tmp dirs); **regression assertion: an old-format sidecar with NO `kind` field reconstructs as `interrupted`.**

`AgentRunnerService` becomes a thin wrapper holding a `RunnerCore<AgentRunRecord>`; `start` passes `ownerId: agentId` so `runId` stays `${agentId}_${startedMs}_${pid}`; `toAgentRun(rec)` projects down to the exact contract `AgentRun` shape (strips `kind`).

**The trap:** `agentStrategy.schema` must make `kind` default to `"agent"` on read (`.default("agent")`), or old/ghost sidecars fail `safeParse` and the `interrupted` reconcile test breaks. The on-disk record is a strict superset of `AgentRun`; the HTTP shape stays exactly as `AgentRunSchema` declares.

Reference: `apps/api/src/agent-runs/agent-runner.service.ts`, `apps/api/test/agent-runs.e2e.test.ts`.

### 2b-2 — `skills` resource

- Contracts `libs/contracts/src/skills/`: `skill.schema.ts` unifies `domain.ts` `Skill` (`id, name, glyph, desc, file`) + `instructions` body; `skills.contract.ts` (CRUD + `startSkillRun`). Export from `index.ts`, register in `app.contract.ts` + `main.ts`.
- Backend `apps/api/src/skills/`: `skills.storage.service.ts` (clone of `agents.storage.service.ts`, SKILL.md frontmatter+body), `skills.errors.ts`, `skill-runner.service.ts` (thin `RunnerCore` wrapper, kind `skill`), controller, module.
- Frontend: migrate `useCatalog` skills → `features/skills/queries|mutations` (`useSkillsQuery`, `useCreateSkillMutation`, `useStartSkillRunMutation`) using `selectApiResponseBody` + `getXxxQueryKey`. `SkillTile`/`RunModal` unchanged — data source only.

### 2b-3 — `pipelines` resource

- Contracts `libs/contracts/src/pipelines/`: `pipeline.schema.ts` 1:1 with `domain.ts` **plus an explicit `id` per phase** (override the positional/agent-name reference — two phases can share an agent). `PhaseLoopSchema = {to, maxRetries≥0, escalate, then}`; `loop.to`/`then` reference phase ids; `.superRefine` rejects dangling back-edges. Register in both routers.
- Backend `apps/api/src/pipelines/`: storage clone (`.pipeline.md`), errors, controller, module.
- Frontend: migrate pipelines off `useCatalog` → `features/pipelines/queries|mutations`. `PipelineCard`/`PhaseChain` unchanged.

### 2b-4 — `PipelineRunnerService` (second-highest risk)

- Contract `libs/contracts/src/pipeline-runs/`: `StageRun = {phaseId, runId, attempt, status: RunStatus}`; `PipelineRun = {pipelineRunId, pipelineId, status: PipelineState, currentStage, stageRuns[], startedAt, cwd}`; `PipelineStateSchema = enum(done|parked|failed|running)`.
- Driver (`apps/api/src/pipelines/pipeline-runner.service.ts`): shared root `<RUNS_DIR>/<pipelineRunId>/`, each phase a child sandbox `<root>/<phaseId>/` (one `RunnerCore.start` = one `.log` for per-phase polling). **Handoff = copy** phase N's `produces` into phase N+1's cwd at relative `consumes` (copy not move, so retries can re-read), both resolved with path-containment guard.
- **Back-edge / tester loop:** on stage failure, if `attempts[phaseId] < loop.maxRetries`, increment, write failure context into `loop.to`'s cwd as its handoff input, jump to `loop.to`. On exhaustion → `escalate` (surface, don't continue silently) → `then` (or `"fail"`). **`maxRetries` is the hard infinite-loop fuse; persist `attempts` in the `PipelineRun` sidecar so a restart can't reset the counter.**
- Status mapping: any stage `running`→`running`; any `awaiting-approval`→`parked`; last `done`→`done`; exhausted+`then==="fail"`→`failed`.
- Restart: separate `pipeline-run.json` sidecar persisted after **every** phase transition. On restart a mid-flight pipeline → `failed` (no auto-resume), except `currentStage` in `awaiting-approval` → stays `parked`.
- Frontend: `usePipelineRunQuery` (poll), wire `PhaseChain` to real `stageRuns`.

**Acceptance (API e2e):** A→B handoff file present in B's cwd; B fails with `loop.to=A, maxRetries=2` retries exactly twice then escalate→then (never infinite); restart reconstructs `PipelineRun` consistently.

---

## Phase 3 — Approval gate (identity core)

### 3-1 — Shared `RunStatus` + frontmatter (breaking contract change)

Widen to a shared `RunStatusSchema = enum(running, done, error, interrupted, awaiting-approval)` in `libs/contracts/src/common.schema.ts`; alias `AgentRunStatusSchema = RunStatusSchema`. **Forces re-type of:** runner `finalize`/reconcile switches, FE run-status switches (RunModal pill, ActivityFeed), the agent-run contract test, pipeline status mapping. Add `requires_approval?: boolean` + `risk?: enum(low|medium|high)` to agent/skill schemas, parse-tolerant (drop unknown like `model`/`thinking`).

### 3-2 — `approvals` resource

`approval.schema.ts` = `domain.ts` `Approval` (`id, skill, action, detail, risk`) extended with `runId`, `status: pending|approved|rejected`, `requestedAt`, `decidedAt?`. Contract: `listPending`, `getApproval`, `approve`, `reject`. `apps/api/src/approvals/` module + durable storage (one atomic `.json` per approval in `APPROVALS_DIR`, tolerant parse). Register in both routers.

### 3-3 — Pause hook (Variant A) + restart semantics + FE

Pause hook lives in **`RunnerCore`** (so all kinds inherit once). Variant A = gate at the spawn boundary: a run/phase marked `requires_approval` creates `Approval(pending)`, flips run → `awaiting-approval`, and does **not** spawn until approved (`approve`→`running`; `reject`→terminate, no external effect). `RunnerCore.init` reconcile: `awaiting-approval` survives restart unchanged (no live child is expected); its approval stays `pending`. FE: `ApprovalCard` → `useApprovalsQuery`(poll) + `useApprove/RejectMutation`; surface pending in ActivityFeed/approval lane.

**Acceptance (API e2e):** gated run pauses with no external effect; approve resumes, reject terminates; restart-during-awaiting preserves `pending`/`awaiting-approval`.

---

## Phase 3.5 — Gate policy engine (rules, not a flag)

Builds `gates` from scratch. Lands **before** F4/F5 so their gating wires onto the engine once.

- **3.5-1** Unify `Approval`/`PendingApproval` to one superset shape (`steps[]` + combinator; F3 `Approval` maps as a single human step). Confirm A stays as phase-boundary fallback, **B is the per-action path**.
- **3.5-2** `gates` resource: `libs/contracts/src/gates/gate.schema.ts` (`MatchCondition` discriminated union tool/action/threshold/scope/context; `Decision = allow|notify|ask|deny`; recursive `Resolve = human|check|agent|all|any`; `GateRule`, `GateRuleInput`, `IntendedAction`, `GateEvaluation`, `PolicyViolation`) + `gate.contract.ts` (`getSystemPolicy`, `getAgentGates`, `replaceAgentGates`→`422` on weakening floor, `evaluate`, `listPendingApprovals`, `resolveApproval`). Register both routers. `apps/api/src/gates/policy.storage.service.ts` = locked `POLICY.md` (`policy: GateRule[]`, `source:'system'`, `locked:true`, tolerant to one bad rule); agent rules = `gates: GateRuleInput[]` in agent/skill frontmatter.
- **3.5-3** `GateEvaluatorService` (matcher → decision, first-match-wins precedence, AND conditions, threshold operators, resolve flatten) + `evaluate` endpoint (thin wrapper, no self-HTTP) + **harden-only validation** (agent rule may not weaken a locked floor rule on the same matcher → `422 PolicyViolation`). Unit tests: precedence, AND, threshold, harden.
- **3.5-4** `RunnerCore` eval hook: extend the `PROGRESS` line scanner to recognize `INTENT {json}` → build `IntendedAction` → `gate.evaluate` → `ask`: create approval + `awaiting-approval` (child blocks on a decision file); `deny`: terminate; `allow/notify`: pass.
- **3.5-5** FE: redesign "approval rules" panel (inherited locked / own drag-reorder / add-rule modal), gate query hooks, `ApprovalCard` with `steps[]` view.
- **3.5-6** Legacy desugar: `requires_approval:true` → catch-all `{match:[{type:context, context:'*'}], decision:ask, resolve:human}`; `risk` → display-only.

**Acceptance (API e2e):** `git.push` to `main` rule → `awaiting-approval`, push to `feature/*` passes silently; attempt to weaken floor → `422`; `all:[ci_green, human]` resolve gates correctly; threshold `purchase.amount>500`→ask, `120`→allow; restart-during-awaiting holds; legacy `requires_approval` behaves as catch-all `ask:human`.

---

## Phase 4 — Memory layer

- DI token `VAULT_DIR`; tiers `memory`/`daily/`/`knowledge/`; index-first retrieval (no embeddings).
- `memory.contract.ts`/`memory.schema.ts`: `GET /memory/index`, `/note/:id`, `/graph` (`{nodes:{id,label,tier}[], edges:{from,to}[]}` from `[[...]]` wiki-links — **reuse/unify with existing `graphify-out/`, cache like graphify**), `/search?q=`, `POST /memory/daily` (safe append). `Note = {id, path, frontmatter, links[], backlinks?}`.
- Write policy: `daily/` append auto; `MEMORY.md` curation → routes through the **3.5 engine** (write = `action: write` on `MEMORY.md` → `ask`). ActivityFeed fed by real runs/approvals/memory writes (replace mock).
- FE: Memory screen force-directed graph (d3-force), note viewer, real ActivityFeed.

---

## Phase 5 — Heartbeat & automations

- `automations.contract.ts`/`automation.schema.ts`: `Automation = {id, name, trigger, target, enabled}`; `trigger = {type:cron, expr} | {type:event, event}`; `target = {pipelineId|agentId|skillId}`; CRUD + enable/disable.
- Scheduler service (`@nestjs/schedule`, TZ `Europe/Prague`): on trigger → start target run via runner. **Every external-effect action queues through the 3.5/F3 approval path** — autonomy is scheduling, not destructive action. Decide idempotence-after-restart (no double-fire) and missed-trigger policy (catch-up vs skip).
- Morning-briefing automation → writes `daily/` note + Overview summary.
- FE: Automations screen (trigger builder, target picker, enable/disable, next-run preview).

---

## Phase 6 — Robust executor

- **pgid tracking (primary):** spawn `detached` with own process group, persist `pgid` in sidecar (field already reserved in `BaseRun`); on restart probe `process.kill(pgid, 0)` → reattach monitoring or clean group-kill, instead of blind `interrupted` relabel. **Heartbeat file (supplement):** stale = dead, fresh = alive.
- Reconnect: in `RunnerCore.init`, for `running` runs probe real liveness via pgid before reconciling. Track exit by polling pgid, not `child.on("exit")` (orphans aren't this process's children).
- Concurrent-safety tests (start/stop/tail of N runs, race-safe sidecar writes).
- Real `claude -p`: build prompt from agent `instructions` + handoff context; guard token budget vs limits widget; surface errors. (`AGENT_RUNNER_MODE=claude` swap already exists.)

---

## Testing strategy

- **Contract tests** (`libs/contracts/src/**/*.test.ts`): every new schema/router — enum membership (incl. `awaiting-approval`), `GateRule`/`Resolve` recursion (`resolve` only on `ask`), phase loop-target `superRefine`.
- **Storage unit tests** (`apps/api/src/**/*.test.ts`, tmp dirs): skills/pipelines/POLICY.md parse-tolerance + path-traversal, cloning `agents.storage.service.test.ts`.
- **API e2e** (`apps/api/test/*.e2e.test.ts`, NestJS `Test` + supertest + `until()` poll) — this is where runner/approval/loop **correctness** lives: pipeline handoff file existence; loop `maxRetries` cap (exactly N then escalate); approval pause→approve→resume / reject→no-effect; restart-during-awaiting; gate `evaluate`→`ask`; harden-only `422`.
- **`RunnerCore` unit test:** old-format (no-`kind`) sidecar reconstructs `interrupted` — the 2b-1 regression guard.
- **Playwright (NEW — install from scratch, 6th project outside the 5-project `vitest.workspace.ts`):** only UI throughlines where contract→DS wiring is under test:
  1. create pipeline → run → `PhaseChain` advances through stages to completion;
  2. pending `ApprovalCard` → approve → run resumes (poll-driven UI);
  3. create skill → run from `SkillTile`/`RunModal` → log streams;
  4. Memory screen renders force-directed graph + note viewer.
     Keep runner/loop timing logic in API e2e (browser is slow/flaky for back-edge timing). At the end of implementation, add any further critical UI paths that emerged.

---

## Verification (end-to-end)

1. After **each phase**: `npm run lint && npm run typecheck && npm run test` all green (5 vitest projects).
2. After Playwright is added: run the Playwright project headless; confirm the four throughlines pass.
3. Manual smoke via `/run` skill or `npm run` dev: create a 2-phase pipeline, start it, watch `PhaseChain` progress; force a gated action and approve it from the UI; confirm a denied/rejected action produces no external effect.
4. Restart smoke: kill+restart the API mid-run; confirm `running`→`interrupted`, `awaiting-approval` survives, and (F6) a pgid-live orphan is detected rather than mislabeled.
5. `graphify update .` after code changes to keep `graphify-out/` current (per CLAUDE.md).

## Critical files

- `apps/api/src/agent-runs/agent-runner.service.ts` — source of the `RunnerCore` extraction (must stay behavior-identical).
- `apps/api/test/agent-runs.e2e.test.ts` — regression contract pinning `runId` format, sidecar shape, reconcile.
- `apps/api/src/agents/agents.storage.service.ts` — clone template for all new Markdown storage (skills, pipelines, POLICY.md).
- `libs/contracts/src/common.schema.ts` + `agent-runs/agent-run.schema.ts` — where the shared `RunStatus += awaiting-approval` lands.
- `libs/contracts/src/app.contract.ts` **and** `apps/api/src/main.ts` — both must register every new resource.
- `apps/web/domain.ts` — the final shapes all new contracts unify with.
- `apps/web/state/store.tsx` (`useCatalog`) — the mock being retired per-resource.
