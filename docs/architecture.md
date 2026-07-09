# Z.I.B.B.Y Architecture

## Monorepo structure

```
z.i.b.b.y/
├── apps/
│   ├── api/          NestJS backend — port 3333
│   └── web/          Next.js 15 frontend — port 3000
├── libs/
│   ├── contracts/    @zibby/contracts — Zod schemas + ts-rest router (source of truth)
│   ├── design-system/ @zibby/design-system — UI primitives, theme, tokens
│   └── forms/        @zibby/forms — React Hook Form + Zod adapter over DS
├── e2e/              Playwright end-to-end tests
├── ops/              launchd plists, backup script, newsyslog config
└── docs/             this documentation
```

Package manager: **pnpm** (workspace: protocol, pnpm-lock.yaml v9). Never `npm` or `yarn`.

`apps/api/src` today holds ~38 feature modules (agents, pipelines, goals, chains, tasks,
channels, chat, machine, approvals, gates, gate-rules, mandate, budget, limits,
limits-resume, integrations, credentials via integrations, memory, activity,
activity-view, automations, monitors, discovery, briefing, artifacts, projects, system,
health, events, commands, hooks, mcp, skills, gaps, research, ideas, patterns, pins,
runner, workspace, shared) alongside `app.module.ts`/`main.ts`. Each is a self-contained
NestJS module (own `.module.ts`, controller, storage/service, tests); see `docs/api/`
for a page per module.

## Layers and dependencies

```
apps/web  ─── @zibby/contracts (ts-rest client, types)
          ─── @zibby/design-system (UI components)
          ─── @zibby/forms (forms)

apps/api  ─── @zibby/contracts (ts-rest server implementation)
          ─── NestJS (DI, modules, controllers)

libs/contracts ─── zod (schemas and validation)
               ─── @ts-rest/core (contract definitions)

libs/design-system ─── Tailwind v4 (CSS-first @theme)
                   ─── CVA (variant composition)
```

`libs/contracts` is the single source of truth for types and API shape — both server
and client import it, and there is no code generation step.

## Data flow (typical request)

```
Operator clicks in the UI
  → Next.js page component
  → TanStack Query hook (useXxxMutation / useXxxQuery)
  → ts-rest client (apiClient from apps/web/state/api.ts)
  → HTTP to apps/api :3333
  → NestJS controller (@TsRestHandler)
  → Service layer (business logic)
  → File-based storage (ZIBBY_DATA_DIR / vault)
  → Response back through the ts-rest contract
  → TanStack Query cache invalidation
  → React re-render
```

## Persistence — files are the source of truth

All data is files on disk. There is no SQL database. Every file-backed store resolves
its base directory from `resolveDataRoot()` (`apps/api/src/shared/data-dir.ts`), which
defaults to `.zibby/data` and is fully repointed by the `ZIBBY_DATA_DIR` env var (used
by tests and worktrees to isolate their data root).

| Data                    | Format                       | Location                                                |
| ------------------------ | --------------------------- | -------------------------------------------------------- |
| Agent definitions        | Markdown + YAML frontmatter | `.zibby/data/agents/<id>.md`                          |
| Pipeline definitions     | Markdown + YAML frontmatter | `.zibby/data/pipelines/<id>.pipeline.md`              |
| Run records (sidecar)    | JSON                        | `.zibby/data/agents/<id>/runs/<runId>/sidecar.json`   |
| Run logs                 | plaintext                   | `.zibby/data/agents/<id>/runs/<runId>/run.log`        |
| Approvals                | JSON                        | `.zibby/data/approvals/<id>.json`                     |
| Automations              | JSON                        | `.zibby/data/automations/<id>.json`                   |
| Projects                 | JSON                        | `.zibby/data/projects/<id>.json`                      |
| Scheduled tasks          | JSON                        | `.zibby/data/tasks/<id>.json`                         |
| Activity log             | JSONL (append-only)         | `.zibby/data/activity/YYYY-MM-DD.jsonl`               |
| Memory vault             | Markdown + frontmatter      | `.zibby/data/vault/{memory,daily,knowledge}/<id>.md`  |
| Integrations             | JSON                        | `.zibby/data/integrations/<id>.json`                  |
| Credentials              | JSON (separate)             | `.zibby/data/credentials/<integrationId>.json`        |
| Budget ledger            | JSON                        | `.zibby/data/budget-ledger/`                          |
| Gate floor (POLICY.md)   | Markdown                    | `.zibby/data/gates/POLICY.md`                         |
| Global gate rules        | JSON                        | `.zibby/data/gate-rules/<id>.json`                    |
| Goal definitions         | Markdown + YAML frontmatter | `.zibby/data/goals/<id>.goal.md`                      |
| Chain definitions        | JSON                        | `.zibby/data/chains/<id>.json`                        |
| Artifact provenance      | JSON                        | `.zibby/data/artifacts/<id>.json`                     |

## Running processors (the abstraction)

```
TaskSchedulerService   ← a scheduled / immediate task
AgentRunnerService     ← runs a single agent
PipelineRunnerService  ← orchestrates pipeline phases
GoalRunnerService      ← maker/verifier iteration loop, built on Agent+PipelineRunner
ChainRunnerService     ← sequences pipeline runs as steps, built on PipelineRunner
    ↓ agent + pipeline runs
RunnerCore             ← universal spawn engine
    ↓
child_process.spawn()  ← claude CLI (or another command)
    ↓
Log file + sidecar JSON
```

`RunnerCore` (`apps/api/src/runner/runner-core.ts`) is the central spawn engine — the
agent runner, skill runner, and pipeline stage runner are thin wrappers around it with
their own `KindStrategy` (how to build the sidecar record and how to validate it on
restart). `GoalRunnerService` and `ChainRunnerService` sit one layer above: a goal
iterates a maker (agent or pipeline) followed by a verifier pipeline; a chain runs a
fixed sequence of pipelines, handing each step's artifact to the next. Task dispatch can
route to any of the four processor kinds — `agent`, `pipeline`, `goal`, `chain`.

## The autonomous loop (two modes)

### Directed

```
Operator submits a task (UI / API)
  → TaskSchedulerService.createTask()
  → Classification (TaskClassifierService) → routing target
  → Dispatch → AgentRunnerService, PipelineRunnerService, GoalRunnerService, or ChainRunnerService
  → Gate evaluation (before every intended action)
  → Result written back to the task record
  → Activity log
```

An explicit target (operator names a specific agent/pipeline/goal/chain) skips
classification entirely — naming is a hard override.

### Autonomous

```
ChannelWatcherService heartbeat (systemConfig.channelTickMs, default 30s)
  → adapter.poll() → new items from email / Slack
  → Sanitize → persist (ChannelItemStore)
  → ChannelTriageFlowService.handle()
  → Classification and tier decision (mandate)
  → Tier 1: act silently | Tier 2: act + report | Tier 3: prepare + wait
  → Activity log
```

## Gate policy (structural protection)

Every intended action of an agent (tool call, action) passes through
`GateEvaluatorService` **before** it runs:

```
IntendedAction (action, tool, scope, branch, context, metrics)
  → GateEvaluatorService.evaluate(rules, action)
  → Iterate rules (agent's own → system floor)
  → First match → decision (allow | notify | ask | deny)
  → ask → RunnerCore.pause() → ApprovalsService.create() → waiting
  → deny → RunnerCore.kill() → status: interrupted
```

The system floor (`POLICY.md`) is locked — an agent can only tighten it, never weaken it.

## TypeScript configuration

- `strict: true` + `noUncheckedIndexedAccess`
- No `any` — use `unknown`, `satisfies`, or generics
- Path aliases in `tsconfig.base.json`:
  - `@zibby/contracts` → `libs/contracts/src/index.ts`
  - `@zibby/design-system` → `libs/design-system/src/index.ts`
  - `@zibby/forms` → `libs/forms/src/index.ts`

## Testing

| Layer                   | Framework                     | Command          |
| ----------------------- | ------------------------------ | --------------- |
| API unit + integration  | Vitest (project: api)          | `pnpm api:test` |
| Web components          | Vitest (project: web, jsdom)   | `pnpm web:test` |
| E2E                     | Playwright                     | `pnpm e2e`      |
| Design system           | Vitest + Storybook             | `pnpm test`     |

`pnpm check:types` runs `tsc --noEmit` for `tsconfig.base.json` + `apps/web/tsconfig.json`.
Note: `rtk pnpm check:types` filters the output and can mask errors — always use direct
`tsc` when in doubt.
