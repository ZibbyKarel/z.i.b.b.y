# ZIBBY backend domain model — research for the "company" metaphor redesign

Scope: `apps/api` (NestJS) + `libs/contracts` (Zod/ts-rest, source of truth) + `.zibby/data` (file storage).
Read-only research; no repo files modified.

---

## 1. Contracts / resources in `libs/contracts`

One folder per domain under `libs/contracts/src/<domain>/`, composed into `apiContract` (`app.contract.ts`), mounted under `/api`. 40 domains. Table below: router, endpoints, and the key schema(s)/fields that matter for the company-metaphor mapping.

| Domain | Endpoints | Key schema fields |
|---|---|---|
| **agents** | POST/GET/GET search/GET :id/PATCH/DELETE `/agents`, GET `/agents/running` | `AgentSchema`: id, name, description, glyph, **avatar**, model (opus/sonnet/haiku), thinking (high/medium/low), tools, optionalTools, category, requires_approval, risk, gates, gateRuleIds, **status** (proposed\|active), **ownerSubsystem**, instructions. Stored as `<id>.md` (YAML frontmatter + Markdown body). |
| **agent-runs** | (in `agents` runtime side) | run record for one agent execution |
| **approvals** | GET `/approvals`, GET `/approvals/:id`, POST `/approvals/:id/approve`\|`reject` | `ApprovalSchema`: id, runId, **kind** (`ApprovalRunKindSchema` — 13 members: agent, pipeline-stage, channel, task, proposed-task(deprecated), pipeline-output, task-output, jira-issue, machine, agent-proposal, herald-graduation, handoff-proposal, review-rule, routing-proposal), skill, action, detail, risk, status (pending/approved/rejected) |
| **artifacts** | GET `/artifacts`, GET `/artifacts/:id` | run artifact (name+content) |
| **automations** | CRUD `/automations`, GET search, POST `/automations/:id/trigger` | `AutomationEventSchema` (9 events: file.created/changed, git.push, pr.opened/merged, run.completed/failed, email.received, slack.message), `TriggerSchema` (cron\|event), `TargetSchema` (pipeline/agent/briefing/memory-distill/pattern-extract/gap-detect/self-knowledge/agent-factory/**sentinel-scan**/**loom-audit**/…) |
| **briefing** | GET `/briefing`, POST `/briefing/generate` | the butler's-briefing digest |
| **budget** | GET `/budget`, GET/PUT `/budget/config` | `GlobalBudgetSchema` (pauseAtRollingPct/pauseAtWeeklyPct), `BudgetStatusSchema` (global window usage + per-project rows) |
| **categories** | CRUD | agent/project category taxonomy |
| **channels** | GET `/channels/items`, GET `/channels/items/:id`, POST dismiss, POST `/channels/integrations/:id/jira-issue` | `ChannelItemSchema`, `TriageCategorySchema` (bug/question/request/other…), `TriageVerdictSchema`, `ChannelItemStateSchema` |
| **chat** | POST `/chat/messages`, GET `/chat/transcript` (+ raw SSE `/chat/stream`) | chat-UI conversational layer |
| **commands** | CRUD `/commands` | `CommandSchema`: id = `/<id>` slash command, description, argument-hint, allowed-tools, model, disable-model-invocation, enabled, instructions. Materialized into every run's `.claude/commands/`. |
| **companies** | CRUD `/companies`, GET search | `CompanySchema`: id, name, desc, **people** (`ProjectPersonSchema[]`), **budget**. Super-entity above Project (Phase 68). |
| **gates / gate-rules** | GET `/gates/policy`, POST `/gates/evaluate`, GET/PUT `/agents/:id/gates`; CRUD+reorder `/gate-rules` | `MatchConditionSchema` (tool/action/threshold/scope/context), `DecisionSchema` (allow/notify/**ask**/deny), `ResolveSchema` (human/check/agent/all/any, recursive), `GateRuleSchema` (source: system/agent/**subsystem**, locked), `SUBSYSTEM_TIER_DEFAULT` (only `beacon` defaults to `ask`) |
| **goals** | CRUD `/goals` (+ goal-run schema) | autonomous iteration loop (maker/verifier) |
| **handoff** | CRUD `/handoff-rules`, CRUD `/handoff-signal-kinds` | see §4 — cross-subsystem dispatch engine |
| **health** | GET `/health` | liveness + subsystem/watcher health |
| **hooks** | CRUD `/hooks` | `HookSchema`: id, event (9 Claude Code lifecycle events), matcher, command, timeout, enabled. Merged into every run's `--settings`; approval hook always first (Law 1). |
| **integrations** | CRUD `/integrations`, PUT/DELETE `/integrations/:id/credentials`, POST `/integrations/:id/test` | `IntegrationKindSchema` (slack/email/jira/github/calendar/sentry), per-kind config schemas (SlackConfig, EmailConfig, JiraConfig, GitHubConfig w/ `streams: issues\|pulls\|ci`, CalendarConfig, SentryConfig), `IntegrationStatusSchema` (connected/disconnected/…) |
| **limits** | GET `/limits` | 5h/weekly Claude subscription usage window |
| **machine** | POST/GET `/machine/actions`, GET/PUT `/machine/config` | "control the machine" dry-run/execute actions (N5, gated) |
| **maestro** | GET `/maestro/queue` | release-queue (merge-watch) |
| **mandate** | GET/PUT `/mandate` | `MandateSchema`: per-channel dispatch/reply autonomy switches, `.strict()` (Law 4) |
| **mcp** | CRUD `/mcp-servers`, PUT/DELETE `/mcp-servers/:id/credentials` | `McpServerSchema`: id, transport (stdio/http/sse), command/args or url/headers, enabled, hasCredentials |
| **memory** | GET index/note/graph/search, POST daily/notes/append/links/import | `NoteSchema`: id, path, tier (memory/daily/knowledge), title, frontmatter, links, backlinks, type (decision/preference/fact/pattern), tags, **subsystem** (shelf owner), **domain** (personal\|work) |
| **monitors** | GET `/monitors/events`, GET `/monitors/events/:id`, GET `/monitors/status` | `MonitorEventKindSchema` (ci-run-failed, error-unresolved, …), `CiStatusStateSchema` (red/green) |
| **pins** | GET/PUT `/pins` | operator's pinned shortcuts |
| **pipelines** | CRUD `/pipelines`, GET `/pipelines/runs` | see §4 — delivery-loop definition |
| **projects** | CRUD `/projects`, search, secrets, profile, standup, resolved, local-state, clone, prs, PR merge | `ProjectSchema`: id, name, path, desc, category, checks, prOpenMode, **budget**, env, logo, identity (people), autonomy_policy, daily_rhythm, **companyId**, **teamId**, gitRemote |
| **review-learning** | GET `/review-rules`, POST promote | distilled PR-review rules |
| **roadmap** | per-project CRUD + play/override/restart/resume/sync/config; global level-mapping | `RoadmapItemLevelSchema` (epic/task), `RoadmapSourceKindSchema` (jira/github/manual), status machine (todo→enqueued→running→awaiting-merge→done, `blocked` derived) |
| **self / self-knowledge** | GET `/self/status`, POST `/self/update`; GET `/self-knowledge` | self-development loop status; composed vault note of agents/pipelines/gates/channels |
| **skills** | CRUD `/skills`, search | `SkillSchema`: same shape as Agent (id, name, glyph, desc, category, requires_approval, risk, gateRuleIds, instructions) — a `SKILL.md` |
| **speech** | POST synthesize, GET voices/status | TTS |
| **subsystems** | GET `/subsystems`, GET `/subsystems/unowned`, GET `/subsystems/:id`, POST `:id/seen`, GET `:id/roster` | see §2 — the 11 federated subsystems |
| **system** | GET/PUT `/system/config` | runtime config knobs |
| **tasks / task-runs** | POST classify, POST `/tasks`, GET scheduled, POST attachments; GET runs, GET runs/archive, GET/DELETE/PATCH runId, GET logs (+SSE), stop/resume | see §4 — TaskTarget union, dispatch |
| **teams** | CRUD `/teams`, search | `TeamSchema`: id, name, **companyId**, desc, **knowledgeBase** (discriminated union, currently only `vault` — read-only) |

Common cross-domain schemas (`common.schema.ts`): `ErrorSchema`, `IsoDateTimeSchema`, `RunStatusSchema` (running/done/error/interrupted/awaiting-approval/paused-limit), `RiskSchema` (low/medium/high), `WorkspaceSchema` (git worktree), `AvatarSchema` (data URI or `/avatars/*` path — **this is the closest thing to an "employee photo" that exists today**), `DeleteResponseSchema`, `RunArtifactSchema`.

---

## 2. Core domain entities and relationships

### The 11 federated subsystems (`libs/contracts/src/subsystems/subsystem.schema.ts`)

Fixed closed enum (`SubsystemIdSchema`), from `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`. Each carries `id`, `name`, Czech `tagline`, Czech `mandate`, brand `color` — **no portrait**; identity is a colored live orb (Phase 90 removed hero images on purpose — "two competing identity marks read as two different objects").

| id | name | tagline (cz) | mandate (role) | color |
|---|---|---|---|---|
| `forge` | Forge | Kovárna doručení | Orchestrates the delivery pipeline (Architekt→Kodér⇄Review→Tester→Dokumentátor) | #5b8def |
| `puls` | Puls | Tep systému | Watches channels, calendar, CI/CD heartbeat | #f2749e |
| `sentinel` | Sentinel | Strážce hranic | Security vs. external world — dependency CVEs, secret leaks | #34c9bd |
| `maestro` | Maestro | Dirigent vydání | Releases — prep, overview, operator-approved merge | #e0a83c |
| `beacon` | Beacon | Maják v noci | Incident escalation — the Tier-3 surface-and-wait contract embodied | #f4785c |
| `scout` | Scout | Zvěd na cestách | Research pipelines that hand an artifact onward | #46cf8b |
| `herald` | Herald | Hlas navenek | Speaks for ZIBBY outward — reactive replies + proactive asks | #56c4d6 |
| `loom` | Loom | Tkadlec kvality | Proactive quality/architecture analysis; findings feed Forge | #b07cff |
| `codex` | Codex | Paměť rodu | Memory management — vault, grounding, nightly distillation, shelves | #c56fd4 |
| `ledger` | Ledger | Správce pokladny | Budgets & limits — spend caps, usage windows, limit-resume | #a9c23e |
| `hearth` | Hearth | Krb domova | Operator's personal life — quick notes, agenda, reminders, separate from work | #d9694a |

`SubsystemWithStatusSchema` adds live status: `state` (idle/running/report/waiting/error), `tier2Count`, `tier3Count`, `errorCount`, `errorRunIds`.

**Roster** (`SubsystemRosterSchema`, `GET /subsystems/:id/roster`) — this is the closest existing "who works here" view:
- `agents`: read off each agent's stored `ownerSubsystem` tag (`RosterAgentRef`: id, name).
- `integrations`: **derived, not stored** — Puls lists every integration; Herald lists only reply-enabled ones (`mandate.reply`); every other subsystem lists none.
- `monitors`: the subset of that subsystem's integrations that are GitHub integrations with a `ci` stream — **no standalone monitor entity**.
- Pipelines are NOT in the roster shape — the web roster tab sources those client-side from the pipeline canvas.

Ownership tagging: `Agent.ownerSubsystem` and `Pipeline.ownerSubsystem` (`OwnableEntityKindSchema = "pipeline" | "agent"`). Integrations do **not** carry ownership — membership is derived by rule, not stored. `GET /subsystems/unowned` surfaces any agent/pipeline that slipped past the write-time 422 without an owner.

Live subsystem code modules exist for only some: `apps/api/src/sentinel/`, `apps/api/src/maestro/`, `apps/api/src/herald/`, `apps/api/src/loom/` — each a thin service (scan/dispatch logic) that emits `HandoffSignal`s; the rest (forge, puls, beacon, scout, codex, ledger, hearth) are pure identity/roster records with their logic living inside domain-appropriate modules (tasks/pipelines for forge, channels/monitors for puls, budget/limits for ledger, memory for codex, etc.) — **there is no uniform "subsystem service" per subsystem**, which matters for the company metaphor (a "department" isn't a single first-class runtime unit everywhere).

### Companies → Teams → Projects hierarchy

```
Company (super-entity, Phase 68)
  id, name, desc, people[] (canonical roster), budget (default)
        │  companyId (bare optional string, NOT FK-validated; dangling → "no company")
        ▼
Team (Firma → Tým → Projekt, "the layer that owns a knowledge base")
  id, name, companyId?, desc, knowledgeBase? (discriminated union: kind "vault" = read-only host path)
        │  teamId (bare optional string; at most one team per project)
        ▼
Project
  id, name, path?, desc, category, checks[], prOpenMode, budget?, env,
  logo (Avatar), identity (people[]), autonomy_policy, daily_rhythm,
  companyId?, teamId?, gitRemote
```

Resolution is **read-time merge, never copy**: a project's *effective* people/budget/integrations = company's data merged with project's own (field-level for budget, by-id override/augment for people) — done by a `ResolvedProjectService` (`GET /projects/:id/resolved`). A dangling `companyId`/`teamId` silently resolves to "none" rather than erroring.

`ProjectPersonSchema`: `id?, name, role, vip? (forces Tier-3), comms_style?` — **this is the closest existing "employee/contact" record**, but it's scoped to people *around* a project (client/stakeholder/team contacts for communication drafting), not to ZIBBY's own agents.

### Agents, Skills, Pipelines — the workforce

- **Agent** (`AgentSchema`): a Claude persona — id/name/description/**glyph**/**avatar**/model/thinking/tools/category/risk/gates/**status** (proposed/active — Agent Factory candidates)/**ownerSubsystem**/instructions. Stored `<id>.md`, Claude-skill-style frontmatter+body.
- **Skill**: structurally identical to Agent minus model/thinking/tools/avatar/ownerSubsystem — a reusable capability bundle, not itself dispatchable as a unit (automations explicitly exclude skills as targets: "a skill can't be a target — isn't an autonomous executable").
- **Pipeline**: a named sequence of **phases**, each either `type: "agent"` (spawns an agent, consumes/produces a file) or `type: "verify"` (deterministic shell checks, no model). Phases carry `loop` back-edges (retry ladder with model/thinking escalation, `maxRetries`, `escalate`, `then: <phase|"fail"|"park">`, `driftTo`). Pipeline-level `outputs[]` (delivery sinks: `pr` or `file`→project/vault) and `ownerSubsystem`, `complexity` (light/standard/deep rung on the routing ladder).
- **Command / Hook / MCP server**: infrastructure entities materialized into every run's Claude Code session (`.claude/commands/`, `--settings`, `--mcp-config`) — not "employees" but tools/equipment an employee is issued.

### Tasks, Runs, Approvals, Gates — the work item lifecycle

```
free text ─▶ TaskClassifierService (2-stage) ─▶ TaskTarget (agent|pipeline|goal|subsystem|orchestrator)
                                                        │
                                                        ▼
                                          TaskSchedulerService.dispatch()
                                                        │
                                    ┌───────────────────┼────────────────────┐
                                    ▼                   ▼                    ▼
                              AgentRunnerService  PipelineRunnerService  GoalRunnerService
                                    │                   │                    │
                                    └─────────── gate check (POLICY.md + agent/subsystem rules) ──┐
                                                                                                    ▼
                                                                                     Approval (pending) ──▶ operator decides
```

`TaskTarget` (discriminated union): `agent`, `pipeline`, `goal` (never auto-classified — only explicit or approved proposal), `subsystem` (explicit-only, resolved by `TaskSchedulerService` to a concrete pipeline/agent before dispatch — never itself the stored run target), `orchestrator` (terminal fallback — a synthetic no-`id` target with every agent as a delegatable subagent; "a task always executes").

`ApprovalRunKind` — 13 gated action kinds (agent, pipeline-stage, channel, task, pipeline-output, task-output, jira-issue, machine, agent-proposal, herald-graduation, handoff-proposal, review-rule, routing-proposal) — each maps to a Tier-3 "surface and wait" moment.

`GateRule` — `match[]` (AND-ed: tool/action/threshold/scope/context) → `decision` (allow/notify/**ask**/deny) → `resolve` (human/check/agent/all/any, recursive). Three evaluation buckets, strictest wins: **system floor** (`POLICY.md`, `locked: true`, cannot be weakened) → **subsystem bucket** (catalog rules tagged `ownerSubsystem`, loaded only for runs of units that subsystem owns) → **agent's own rules**. `SUBSYSTEM_TIER_DEFAULT`: only `beacon` has a catch-all `ask` default (its whole mandate IS Tier-3 escalation).

### Handoff — the cross-subsystem nervous system

See §4 for the full mechanics. Data model: `HandoffSignal` (normalized producer emission: from/kind/severity?/projectId?/title/body/fingerprint) → matched against `HandoffRule` (from/signalKind/minSeverity?/to: {subsystem|pipeline}/tier 1-2-3/enabled/system) → `HandoffOutcome` (dispatched/proposed/none). `HandoffSignalKind` is a registry of what signal kinds mean (builtin/pending/active lifecycle) — 7 builtin kinds from 4 producers (Sentinel/Maestro/Loom/Scout).

### Mandate, Budget, Limits — the operating envelope

- **Mandate** (`data/mandate.json`): per-channel `dispatch`/`reply` autonomy booleans. Defaults: dispatch on, reply off — no outbound reply leaves without explicit per-channel opt-in.
- **Budget** (`data/budget.json` + ledger): global spend ceiling (`pauseAtRollingPct`/`pauseAtWeeklyPct` against the 5h/weekly Claude subscription window) + per-project daily/weekly/monthly run-count and dollar-cost caps, concurrency cap, held-over-cap count.
- **Limits**: read-only live snapshot of the 5h/weekly subscription usage window (sourced from the statusline file, not an Anthropic endpoint — see memory note `project_limits_statusline_source`).

### Channels, Integrations, Monitors, Roadmap

- **Integration** (`IntegrationKindSchema`): slack, email, jira, github, calendar, sentry — one config schema per kind, credentials stored separately (write-only).
- **ChannelItem**: one inbound message/thread, `TriageCategory` (bug/question/request/other), `TriageVerdict`, lifecycle state.
- **MonitorEvent**: `ci-run-failed`, `error-unresolved`, etc. — CI/Sentry-sourced alerts, feed into Handoff via Maestro/Sentinel producers.
- **RoadmapItem**: epic/task level, sourced from jira/github/manual, status machine todo→enqueued→running→awaiting-merge→done (`blocked` is derived, not stored).

### ER-style text diagram

```
Company ──< Team ──< Project >── Integration (slack/email/jira/github/calendar/sentry)
   │(people,budget)   │(knowledgeBase)   │(companyId,teamId; budget/people MERGED at read time)
   │                  │                  ├──< RoadmapItem (epic|task; sourced from integration)
   │                  │                  ├──< ScheduledTask / TaskRun ──> Approval (13 kinds)
   │                  │                  └──< PipelineRun / AgentRun (Workspace: git worktree/branch)
   │
   └── (no formal link to Subsystem — company is orthogonal to the federation)

Subsystem (11, closed enum) ──< owns Agent[] (Agent.ownerSubsystem)
        │                  └──< owns Pipeline[] (Pipeline.ownerSubsystem)
        │                          └──< PipelinePhase[] (agent|verify, loop back-edges)
        ├── emits HandoffSignal ──▶ matched against HandoffRule ──▶ HandoffOutcome
        │                                                            (dispatched|proposed→Approval|none)
        ├── GateRule bucket (ownerSubsystem-tagged catalog rules; strictest-of-three)
        └── roster: agents (stored tag) + integrations (DERIVED: puls=all, herald=reply-enabled)
                   + monitors (DERIVED: subset of integrations w/ GitHub `ci` stream)

Agent ──< AgentRun          Pipeline ──< PipelineRun ──< PipelinePhase run (per stage)
Skill (capability bundle, not dispatchable)   Command/Hook/MCP (materialized into every run)

Task.target: agent | pipeline | goal | subsystem(explicit,resolved-away) | orchestrator(fallback)
Goal: maker + verifier, iterates (never auto-classified)
```

---

## 3. On-disk storage & owning NestJS module

Everything anchors at `resolveDataRoot()` = `ZIBBY_DATA_DIR` env var, or `<repo-root>/.zibby/data` by default (`apps/api/src/shared/data-dir.ts`). Live directory listing (`.zibby/data/`):

| Entity | On-disk path/format | Owning module (`apps/api/src/<x>`) |
|---|---|---|
| Agents | `agents/<id>.md` (YAML frontmatter + Markdown) | `agents/` (`AgentsStorageService`, `AgentRunnerService`) |
| Skills | `skills/<id>.md` | `skills/` |
| Commands | `commands/<id>.md` | `commands/` |
| Hooks | `hooks/<id>.json` | `hooks/` |
| MCP servers | `mcp-servers/<id>.json` (+ `mcp-credentials/`, gitignored) | `mcp/` |
| Pipelines | `pipelines/<id>.pipeline.md` | `pipelines/` (`PipelinesStorageService`, `PipelineRunnerService`) |
| Companies | `companies/<id>.md` or `.json` | `companies/` |
| Teams | `teams/<id>...` | `teams/` |
| Projects | `projects/<id>...` (+ `project-secrets/`) | `projects/` (`ProjectsStorageService`, `project-local.service.ts` resolves clone path) |
| Integrations | `integrations/<id>...` (+ `credentials/`, `integration-state/`) | `integrations/` |
| Approvals | `approvals/` | `approvals/` (`ApprovalsStorageService`) |
| Gate policy floor | `POLICY.md` (locked system rules) | `gates/` (`policy.storage.service.ts`) |
| Global gate-rule catalog | `gate-rules.json` | `gate-rules/` (`GATE_RULES_DIR` override) |
| Handoff rules/signal-kinds | `handoff/` | `handoff/` (`HandoffRuleStore`, `HandoffSignalKindStore`, `HandoffFiredStore` — idempotency by `(rule.id, fingerprint)`) |
| Subsystem findings/seen | `subsystem-seen.json`, per-subsystem findings snapshots | `subsystems/` (`SubsystemFindingsStore`, shared leaf module used by Sentinel+Loom) |
| Mandate | `mandate.json` | `mandate/` |
| Budget | `budget.json` + `budget-ledger/` | `budget/` |
| Roadmap | `roadmap/` (per-project items, config) | `roadmap/` (`RoadmapStore`, `RoadmapSourceService` for Jira/GitHub sync) |
| Goals | `goals/` | `goals/` (`GoalRunnerService`) |
| Tasks (scheduled + runs) | `tasks/` (+ attachments) | `tasks/` (`ScheduledTasksStorageService`, `TaskSchedulerService`, `TaskClassifierService`) |
| Chains (legacy, amputated) | `chains/` (directory still present, feature removed) | — |
| Channels | `channels/` | `channels/` (`ChannelItemStore`, adapter registry) |
| Monitors | `monitors/` (cursors/, status/) | `monitors/` (`MonitorEventStore`) |
| Machine actions | `machine/` | `machine/` |
| Maestro queue | `maestro/` | `maestro/` |
| Herald reply ledger/graduation | `herald/` | `herald/` |
| Memory / vault | `vault/` (Obsidian-style: `memory/`, `daily/`, `knowledge/` tiers) | `memory/` |
| Activity feed | `activity/` + `activity-view.json` | `activity/`, `activity-view/` |
| Artifacts | `artifacts/` | `artifacts/` |
| Chat transcripts | `chat/` | `chat/` |
| Pins | `pins.json` | `pins/` |
| System config | `system-config.json` | `system/` |
| Routing proposals (NS2 F10) | `routing-proposals/` | `roadmap/` (switchboard uncertainty park) |
| Research digest | `research-digest.json` | `scout`-adjacent (roadmap/automations) |

Every write path enforces filename-safe ids (`AGENT_ID_REGEX` family) at both the Zod boundary and the storage layer (defense in depth) — no path traversal.

---

## 4. Dispatch / routing / the delivery loop

**Two-stage classifier** (`apps/api/src/tasks/task-classifier.service.ts`, NS2 F9/F10):
- **Stage 1** — "whose domain is this?" Asks the router (Haiku via `claude -p`, `TASK_ROUTER` DI token) to pick a **subsystem only** (`SUBSYSTEMS` catalog) — structurally rejects an agent/pipeline verdict at this stage. Falls back to a deterministic `KeywordScorer` if the router is unavailable/times out/errors; falls back further to the `orchestrator` target if confidence < `ORCHESTRATOR_FALLBACK_THRESHOLD` (0.5). `isAmbiguous()` (margin < 0.15 between top-2, or absolute confidence < 0.35) flags a coin-flip verdict — interactive callers surface it, the autonomous roadmap-release path parks it as a `routing-proposal` approval (Tier-3) instead of guessing.
- **Stage 2** — `classifyWithinSubsystem()`: once a subsystem is named (explicitly by the operator/@mention, or by stage 1), pick the concrete unit *within that subsystem's roster only* — never escapes to another subsystem or the full catalog. A `PIPELINE_COMPLEXITY_ORDER` ladder (light→standard→deep) plus an `EFFORT_RULE`/`PR_SIZING_RULE` preamble tells the router to pick the cheapest rung that can safely do the work. `SUBSYSTEM_FALLBACK` (per-subsystem policy, exhaustive `Record<SubsystemId,...>`) decides what "unsure" resolves to: `"primary"` (cheapest owned pipeline / sole agent) for every crewed subsystem, `"orchestrator"` for `beacon`/`ledger` (own no dispatchable units by design).

**`TaskSchedulerService.resolveSubsystemTargetOrNull`** (`apps/api/src/tasks/task-scheduler.service.ts`) implements the "0/1/N owned units" rule for an explicit `subsystem` target: 0 owned → null (no capability); 1 owned → dispatch straight to it, classifier never called; 2+ owned → `classifyWithinSubsystem`, optionally constrained to PR-capable pipelines when the task requires a `pr` output sink.

**Handoff engine** (`apps/api/src/handoff/handoff.service.ts`, `HandoffService.evaluate`) — replaces three former hard-coded producer→consumer wires (Sentinel CVE dispatch, Maestro post-merge-red dispatch, Loom's deliberate no-dispatch) with one declarative rule model. Called synchronously inside a producer's scan tick (Sentinel/Maestro/Loom/Scout), never throws (fail-open → `{action:"none"}`). Idempotent per `(ruleId, signal.fingerprint)`. Tier 1 → dispatch silently via `TaskSchedulerService`; Tier 2 → dispatch + activity report; Tier 3 → park a `HandoffProposal` behind a `handoff-proposal` Approval.

**The delivery loop** (Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor) is the `delivery` pipeline owned by `forge` (`.zibby/data/pipelines/delivery.pipeline.md`), not special-cased code — it's data read by the generic `PipelineRunnerService`:
1. `architekt` (agent `architect`, opus/high) task.md → plan.md
2. `koder` (agent `fullstack-developer`, sonnet/medium) plan.md → implementation.md — runs the project's own lint/typecheck/test before handing off
3. `review` (agent `code-reviewer`, opus/high, **qualify: true** — a gate phase) implementation.md → review.md — parses a `<verdict>pass|gap|drift</verdict>`; `gap` loops back to `koder` (max 3 retries, escalating model/thinking), `drift` loops back to `architekt` (`driftTo`) since a re-plan is needed, exhaustion → `park`
4. `n-9` (agent `test-automator`, **qualify: true**) review.md → test-automator.md — same gate logic, max 2 retries
5. `dokumentator` (agent `documentation-engineer`, sonnet/low) → docs.md
6. `outputs: [{type: "pr", from: docs.md}]` — the PR-is-the-gate sink, always Tier-3 (`pipeline-output` approval)

This is a **bounded state machine**, not a scripted sequence: `PhaseLoop` (`to`, `maxRetries`, `escalate`, `then: <phase|"fail"|"park">`, `driftTo`, per-retry `escalation[]` ladder) is generic pipeline-schema machinery any pipeline can use.

---

## 5. Live streams (SSE) vs. polling

**SSE** (`@Sse(...)` NestJS decorator, `text/event-stream`):
- `GET /api/events` (`events.controller.ts`) — the global activity feed
- `GET /api/chat/stream` (`chat.controller.ts`) — chat token stream (raw `@Sse` outside ts-rest, since ts-rest doesn't model streaming)
- `GET /api/tasks/runs/:runId/logs/stream` and `GET /api/tasks/runs/:runId/stages/:phaseId/logs/stream` (`task-run-logs.controller.ts`) — live run/stage log tail

**Polling** (per DNA — "only `health` and `limits` poll"):
- `GET /api/health` — `useHealthQuery` (`apps/web/features/health/queries/useHealthQuery.ts`), `refetchInterval: HEALTH_POLL_MS`, `refetchIntervalInBackground: true`
- `GET /api/limits` — `useLimitsQuery`, same pattern, `LIMITS_POLL_MS`

Everything else (budget, monitors/status, subsystem status, run lists) is either plain on-demand fetch or invalidated via mutation/SSE-driven refetch — not a poll loop.

---

## 6. Existing persona-like naming

| Name | Where defined | What it names |
|---|---|---|
| Forge, Puls, Sentinel, Maestro, Beacon, Scout, Herald, Loom, Codex, Ledger, Hearth | `libs/contracts/src/subsystems/subsystem.schema.ts` (`SUBSYSTEMS`) | The 11 federated subsystems — mythic names + Czech epithets/mandates |
| Velín-D | `docs/superpowers/specs/2026-07-13-velin-d-orb-dashboard-design.md` and 5+ other spec docs, `docs/ns2/DECISIONS.md`, `docs/ns2/PROGRESS.md` | The UI design language/phase codename for the immersive orb-map chrome ("Velín" = Czech for control room / ops room) — not a data entity, a design-system era name |
| Hearth | `subsystem.schema.ts` + `docs/ns2/DECISIONS.md` ("hearth (personal domain) in F8") | Personal-life subsystem — deliberately domestic naming vs. the others' industrial/mythic register |
| Architekt, Kodér, Code-Review(er), Tester, Dokumentátor | `.zibby/data/pipelines/delivery.pipeline.md`, `AgentSchema` mandate string in `subsystem.schema.ts` ("Orchestrace delivery pipeline: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor") | Role names for the delivery-loop phases — closest thing to job titles today, but they're pipeline-phase labels, not stored entities of their own |
| Orchestrator | `libs/contracts/src/tasks/task.schema.ts` (`ORCHESTRATOR_TARGET`, `ORCHESTRATOR_ID`) | The synthetic terminal-fallback identity ("Orchestrator", glyph `compass`) |
| ZT (design tokens) | design-system, referenced in memory notes | "Velín-D phase 2 alignment" palette — infra naming, not persona |

No existing concept of individual "employee" identity beyond the Agent's own name/avatar/glyph — agents are personas (`architect`, `fullstack-developer`, `code-reviewer`, `test-automator`, `documentation-engineer`, `roadmap-decomposer`, …) but are not grouped, ranked, or given a role/title distinct from their `category`/`description` free text.

---

## 7. Gap analysis for a "company" metaphor

### Maps cleanly (1:1 or near-1:1)

| Company concept | ZIBBY concept | Fit |
|---|---|---|
| Department | Subsystem (11, closed enum, id/name/mandate/color) | Very strong — already has identity, mandate, color, roster |
| Employee | Agent (id, name, avatar, glyph, model, category, ownerSubsystem) | Strong — already has an avatar field and a subsystem "reports to" link |
| Department roster / org chart (flat) | `GET /subsystems/:id/roster` (agents+integrations+monitors) | Partial — a flat crew list exists, not a hierarchy |
| Company (the actual client org) | `Company` entity (people, budget) | Already named "Company" but means something different — a *client's* company (super-entity above Project), not ZIBBY's own org. **Naming collision risk** if the redesign reuses "Company" for ZIBBY itself. |
| Policy / compliance floor | `POLICY.md` + gate rules (system/subsystem/agent buckets) | Maps to "company policy" cleanly |
| Approval / sign-off | Approval (13 kinds) + tiers | Maps to "manager sign-off" |
| Budget / headcount cost | Budget (per-project run/dollar caps) | Maps to "department budget", but is per-*project*, not per-subsystem |
| Handoff between departments | HandoffRule/HandoffSignal engine | Maps to inter-department workflow/escalation |
| Job function / capability | Skill | Maps to a certification/competency, not a person |
| Equipment / tools | Command, Hook, MCP server | Maps to "issued equipment" per employee/session |
| Team (client-facing) | `Team` (Firma→Tým→Projekt, knowledge base) | This is a *client* team already, competing name with "department" |
| Career state | `Agent.status` (proposed/active) | Maps loosely to "candidate / hired" |

### Missing — no backend concept today

1. **Org-chart hierarchy for the federation itself.** Subsystems are a flat closed enum with no parent/child, no "reports to another subsystem" edge, no notion of company-wide leadership. A department head, VP, or cross-department reporting line has no field anywhere.
2. **Department head / manager role.** No agent is flagged as "leads" a subsystem. The roster is a flat list of agents+integrations+monitors; nothing distinguishes a lead from an individual contributor.
3. **Employee profile beyond avatar/glyph/description.** No title, no seniority, no start date, no "employee of the month," no headcount metric per subsystem, no capacity/availability model.
4. **Company entity for ZIBBY itself.** The existing `Company` schema models a *client's* company above Project — reusing it for "ZIBBY the company" would be a semantic collision. A parallel `Organization`/`Firm` concept (or renaming) would be needed if the metaphor wants a single top-level "ZIBBY Inc." wrapping all 11 departments.
5. **KPIs / performance metrics per subsystem or per agent.** `SubsystemWithStatus` has `tier2Count`/`tier3Count`/`errorCount` (recent activity counts), which is a start, but there's no throughput, success-rate, cost-per-task, or "employee performance review" concept.
6. **Schedules / working hours.** `ProjectDailyRhythmSchema` exists per-project (standup timing, monitoring hours) but nothing per-subsystem or per-agent ("Sentinel works nights," "Herald is on-call weekends").
7. **Hiring / onboarding flow as a first-class concept.** Agent Factory (`agent-factory` automation + `agent-proposal` approval) is the closest thing — a candidate agent is drafted and needs sign-off to go `active` — but there's no "job description → interview → onboarding" multi-step flow, just propose→approve.
8. **Cross-department collaboration graph beyond Handoff.** Handoff models one-shot signal→dispatch; it doesn't model an ongoing "which departments routinely work together" relationship or a shared-project team.
9. **Company-wide directory / search by role.** There's a subsystem list and an agent list, but no unified "who does X" directory that spans both, and no free-text role search beyond agent `category`.
10. **Vacation / capacity limits per employee.** Budget/limits model *spend*, not per-agent concurrency or "this agent is at capacity."

### Concrete contract additions likely needed

- `Department` (probably = rename/extend `Subsystem`): add `headAgentId?` (department head), `parentDepartmentId?` (hierarchy, if wanted), maybe `headcount` computed field.
- `Employee` (probably = extend `Agent`): add `title?` (distinct from free-form `category`), `seniority?` enum, `startedAt?` (IsoDateTime), possibly a proper `role` field separate from `description`.
- `Organization`/`Company(ZIBBY)` top-level wrapper — needs a **naming decision** since `Company` is taken by the client-facing super-entity. Likely `Firm`/`Org`/reuse `Company` for ZIBBY and rename the client concept (bigger migration).
- `DepartmentKPI` or extend `SubsystemWithStatus` with throughput/success-rate/cost fields sourced from the budget ledger + activity log (aggregation, not new storage).
- `OrgChartEdge` or a `reportsTo`/`managedBy` field if a hierarchy beyond the flat 11 is wanted.
- Extend `SubsystemRosterSchema` to mark one roster agent as `lead: true` or add a separate `headAgentId` on `Subsystem` itself (simpler, no roster-shape change).
- Employee "photo": `AvatarSchema` already exists and is reused by Agent/Project/Pipeline — no new schema needed, just consistent UI application.

---

## 8. Laws/invariants from CLAUDE.md constraining the redesign

1. **Approval-first is structural** (Law 1) — enforced in code by: the locked `POLICY.md` gate floor (`gates/policy.storage.service.ts`, `GateRuleSchema.locked`), the runner's hard-coded approval hook that always runs first and rejects any custom `PreToolUse`/`Bash` hook (`HookSchema` docblock: "PURELY ADDITIVE... can never weaken the approval gate"), and `TeamSchema.knowledgeBase.readOnly` being a literal `true` (not a boolean the operator can flip) — "read-only is structural, not a setting." Any company-metaphor redesign must keep gate evaluation as a server-side, non-bypassable layer — a "manager approves" UI affordance cannot itself grant privilege.
2. **Files are the source of truth** (Law 2) — every entity above is a file under `.zibby/data/`; the web UI is a view. A company-metaphor redesign that adds `Department`/`Employee` fields must extend the existing Zod schemas + file stores, not introduce a separate database.
3. **No autonomous commit to the outside world** (Law 3) — enforced via `PipelinePrOutputSchema`/`pipeline-output`+`task-output` approvals (`ApprovalRunKindSchema`) — a PR is *always* parked for sign-off regardless of pipeline/department. `prOpenMode` (draft vs ready) never changes this gate. A department/employee reframing must not let a "delegate to employee" affordance skip this.
4. **The gate cannot be talked around** (Law 4) — enforced by `MandateSchema`/`MandateChannelSchema` being `.strict()` at every level with a comment: "a channel item can never write this; only the operator's PUT /api/mandate can." Inbound channel content (Slack/email/Jira) is data, never a command — relevant if "employees" get chat-like personas that could be prompted by external content.
5. **Always answerable** (Law 5) — activity log (`activity/` + `ActivityLogService`) records every dispatch/handoff/approval decision; a company-metaphor UI ("what did the Sentinel department do today") is a read-model over this existing log, not a new audit trail.
6. **Autonomy tiers (1/2/3)** are enforced per-action via the `Decision` enum (`allow/notify/ask/deny`) and `ApprovalRunKind`, not per-subsystem or per-agent globally — `SUBSYSTEM_TIER_DEFAULT` shows only `beacon` has a blanket tier-3 default; every other subsystem's tier is decided per matched rule. A "department has tier N" mental model would be a simplification of what's actually a per-action, per-rule evaluation — worth flagging explicitly in the redesign so the company metaphor doesn't imply more uniformity than the gate engine actually has.
7. **Fixed 11-subsystem enum, closed by design** — `subsystem.schema.ts` docblock: "Fixed set — ZIBBY doesn't grow a twelfth without a design decision, so this is a closed enum, not a free-form string." Any redesign that wants a 12th department (or a dynamic department list) is itself an architectural decision, not just a UI reskin — `SubsystemId` is a Zod enum consumed by exhaustive `Record<SubsystemId,...>` maps in the classifier (`SUBSYSTEM_FALLBACK`) and gate defaults (`SUBSYSTEM_TIER_DEFAULT`), so adding one requires touching every exhaustive map (TypeScript will force this at compile time, which is the intended guardrail).

---

## Key files for follow-up

- `libs/contracts/src/subsystems/subsystem.schema.ts` — the 11-department registry
- `libs/contracts/src/agents/agent.schema.ts`, `libs/contracts/src/handoff/handoff.schema.ts`, `libs/contracts/src/gates/gate.schema.ts` — employee/handoff/policy schemas
- `libs/contracts/src/companies/company.schema.ts`, `libs/contracts/src/teams/team.schema.ts`, `libs/contracts/src/projects/project.schema.ts` — client-org hierarchy (naming-collision risk for the metaphor)
- `apps/api/src/tasks/task-classifier.service.ts`, `apps/api/src/tasks/task-scheduler.service.ts` — two-stage dispatch
- `apps/api/src/handoff/handoff.service.ts` — cross-department handoff engine
- `.zibby/data/pipelines/delivery.pipeline.md` — the delivery loop as data
- `apps/api/src/shared/data-dir.ts` — storage root resolution
- `apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx` — current roster UI (closest existing "department page")
- `apps/web/features/companies/Screen.tsx` — current client-company catalog UI
