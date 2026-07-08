# API — Overview

**Stack:** NestJS + ts-rest + Zod
**Port:** 3333 (default, overridable via `PORT`)
**Entry point:** `apps/api/src/main.ts`
**Root module:** `apps/api/src/app.module.ts`
**OpenAPI docs:** `http://localhost:3333/docs` (swagger-ui-express, generated from the contracts)

## Bootstrap

`main.ts` does the following on startup:

1. Creates the NestJS app from `AppModule`.
2. Enables CORS — allowed origins come from `CORS_ORIGIN` (comma-separated, default `http://localhost:3000`).
3. Generates an OpenAPI document from the ts-rest contracts (served at `/docs` only — not a source of truth).
4. Arms `app.enableShutdownHooks()` so every service's `onModuleDestroy` (run/verifier reapers) fires on `SIGTERM` — under `ts-node-dev --respawn` and launchd a restart is a signal, not an `app.close()`.
5. Installs a process-level `unhandledRejection` logger — a long-running channel daemon (IMAP/Slack/…) can reject a promise outside any `await` the app controls, so this is the floor that keeps the process from dying silently on a stray library rejection (Law 5: always answerable).
6. Optionally arms a `SIGUSR2` heap-snapshot trigger (`HEAP_SNAPSHOT_ON_SIGUSR2=1`) for diagnosing memory leaks on the compiled production process.
7. Listens on `process.env.PORT ?? 3333`.

## Modules (36 feature modules)

Imports in `AppModule`, in the order they're registered:

| Module                    | File                                 | Responsible for                                                             |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `LoggingModule`           | `shared/logging/`                    | `LoggerService`, `TraceContextService`                                       |
| `SystemModule`            | `system/system.module`               | File-backed runtime system config (`system-config.json`) + policy floor      |
| `PinsModule`              | `pins/pins.module`                   | Quick-launch pins (`pins.json`)                                              |
| `ActivityLogModule`       | `activity/activity-log.module`       | Append-only audit log                                                        |
| `ActivityViewModule`      | `activity-view/activity-view.module` | RightRail live-log display config (which activity groups show/group/hide)    |
| `AgentsModule`            | `agents/agents.module`               | Agent CRUD + run dispatch                                                    |
| `SkillsModule`            | `skills/skills.module`               | Skill CRUD                                                                   |
| `ProjectsModule`          | `projects/projects.module`           | Projects, categories, matching                                               |
| `PipelinesModule`         | `pipelines/pipelines.module`         | Pipeline CRUD + orchestration                                                |
| `GoalsModule`             | `goals/goals.module`                 | Goal loop engine (maker/verifier cycle)                                      |
| `ApprovalsModule`         | `approvals/approvals.module`         | Approvals (all kinds)                                                        |
| `ArtifactsModule`         | `artifacts/artifacts.module`         | Durable artifact provenance registry                                         |
| `ChainsModule`            | `chains/chains.module`               | Pipeline-to-pipeline chaining (artifact-fed downstream runs)                  |
| `GateRulesModule`         | `gate-rules/gate-rules.module`       | Global gate-rule catalog                                                     |
| `MemoryModule`            | `memory/memory.module`               | Vault CRUD, grounding, search                                                 |
| `RunRecorderModule`       | `memory/run-recorder.module`         | Records run outcomes into the vault                                          |
| `ActivityRecorderModule`  | `activity/activity-recorder.module`  | Maps business events → activity entries                                      |
| `BriefingModule`          | `briefing/briefing.module`           | Briefing generation                                                          |
| `AutomationsModule`       | `automations/automations.module`     | Cron/event triggers                                                          |
| `IntegrationsModule`      | `integrations/integrations.module`   | Channel adapters, credentials                                                |
| `HooksModule`             | `hooks/hooks.module`                 | Custom Claude Code hook catalog, merged into every run's `--settings`        |
| `McpModule`               | `mcp/mcp.module`                     | MCP server catalog + credentials                                             |
| `CommandsModule`          | `commands/commands.module`           | Custom slash-command catalog, materialized into a run's working tree         |
| `MandateModule`           | `mandate/mandate.module`             | The operator's autonomy scope                                                |
| `ChannelsModule`          | `channels/channels.module`           | Heartbeat watcher, triage, channel item store                                |
| `MachineModule`           | `machine/machine.module`             | Controlling the machine directly (file ops), gated behind the approval floor |
| `MonitorsModule`          | `monitors/monitors.module`           | CI/CD monitor adapters (GitHub CI) + alert dispatch                          |
| `DiscoveryModule`         | `discovery/discovery.module`         | Bug/request triage from inbound channels → proposed tasks                    |
| `ResearchModule`          | `research/research.module`           | Watched-source digest for the morning briefing                              |
| `HealthModule`            | `health/health.module`               | Health check endpoint                                                       |
| `SelfModule`              | `self/self.module`                   | Is the ZIBBY install repo itself up to date (top-bar freshness)             |
| `LimitsModule`            | `limits/limits.module`               | Rate-limit reading, budget display                                          |
| `LimitResumeModule`       | `limits-resume/limit-resume.module`  | Resumes runs paused on a rate limit                                         |
| `EventsModule`            | `events/events.module`               | Single multiplexed SSE endpoint (`GET /api/events`)                          |
| `BudgetModule`            | `budget/budget.module`               | Budget ledger, spend tracking                                                |
| `ChatModule`              | `chat/chat.module`                   | Chat-first conversation (streaming claude session, SSE, MCP tools)          |
| `TasksModule`             | `tasks/tasks.module`                 | Task creation, scheduling, and the unified `/api/tasks/runs/*` run surface   |

`ConfigModule.forRoot({ isGlobal: true })` (from `@nestjs/config`) loads `.env` and is registered first, ahead of these 36.

Two smaller modules are not registered at the app root because they're shared submodules imported by their consumers instead of standalone features: `GatesModule` (`gates/gates.module` — the pure gate-evaluation engine + locked `POLICY.md` floor, imported by `AgentsModule`, `ChannelsModule`, `PipelinesModule`, `TasksModule`) and `ClaudeRunModule` (`runner/claude-run.module` — the `claude -p` command builder shared by all three runners).

## Shared infrastructure (shared/)

### LoggerService + TraceContextService

- `LoggerService` provides `child(name)` → a `ScopedLogger` prefixed with the module name.
- `TraceContextService` keeps `traceId` and `runId` in `AsyncLocalStorage` — every log line and activity entry is automatically correlated.
- Log level: `LOG_LEVEL` env var (debug / info / warn / error).

### FileStorage

- `file-storage/file-utils.ts` — `resolveSafeFile`, `writeFileAtomic`, `ensureDir`, `safeJson`.
- `file-storage/file-lock.ts` — `withPathLock(path, fn)` for a per-file mutex (in-process).
- `data-dir.ts` — `ZIBBY_DATA_DIR` resolution; a lock file prevents a second instance (in-process only — launchd guarantees a single instance via its Label).

### SSE (Server-Sent Events)

- `shared/sse/` — streams log chunks to the client without a WebSocket.
- `events/events.controller.ts` exposes the single multiplexed `GET /api/events` endpoint (see `docs/api/events.md`), the concrete implementation of the "SSE for live streams, polling for state" DNA rule.

## Data directory

Default: `.zibby/data/`
Test: `.zibby/data-test/` (switch via `ZIBBY_DATA_DIR=.zibby/data-test`)

```
data/
├── agents/              agent definitions (.md) + runs/<agentId>/<runId>/
├── pipelines/           pipeline definitions (.pipeline.md) + runs/
├── skills/              skill definitions (.SKILL.md)
├── projects/            project JSON records
├── approvals/           approval JSON records
├── automations/         automation JSON records
├── tasks/                scheduled-task JSON records
├── activity/            per-day JSONL files (YYYY-MM-DD.jsonl)
├── activity-view.json   RightRail activity-group display config
├── vault/               Obsidian vault (memory/ daily/ knowledge/)
├── integrations/        integration JSON config
├── integration-state/   per-integration adapter state (cursors, watcher liveness)
├── credentials/         API keys (kept separate from integrations)
├── project-secrets/     per-project credentials (Jira/GitHub tokens, etc.)
├── budget-ledger/       spend-ledger JSON records
├── gate-rules.json      global gate-rule catalog (single file, not a directory)
├── channels/            channel-item JSON state
├── goals/               goal definitions + run state
├── artifacts/            durable artifact provenance registry
├── chains/               pipeline-chain definitions
├── hooks/                custom Claude Code hook catalog
├── mcp-servers/          MCP server catalog (committed config)
├── mcp-credentials/      MCP credentials (gitignored)
├── commands/             custom slash-command catalog
├── machine/              machine (file-op) action proposals
├── monitors/             CI/CD monitor state
├── proposals/            discovery-triage proposed tasks
├── mandate.json          operator autonomy scope
├── pins.json             quick-launch pins
├── system-config.json   file-backed runtime system config
├── research-config.json  operator research/watch config
├── research-digest.json  latest persisted research digest
└── POLICY.md             locked system policy floor (data root, not under gates/)
```

## Dev vs. production

|                | Dev                       | Production              |
| -------------- | -------------------------- | ------------------------ |
| Command        | `pnpm api:dev`             | `pnpm api:start`         |
| Compiler       | ts-node-dev (hot reload)   | esbuild/tsc (compiled)   |
| Log level      | `debug`                    | `info`                   |
| Data dir       | `.zibby/data`            | `.zibby/data`          |
| Test data      | `pnpm api:dev:test`        | —                         |

## Smoke test

```bash
pnpm api:smoke
```

Runs `apps/api/scripts/claude-smoke.mjs` — verifies the API is live and the claude CLI is available.

## Seed

```bash
pnpm seed           # seed data/
pnpm seed:test      # seed data-test/
```

The `apps/api/scripts/seed.mjs` script creates baseline agents, pipelines, and projects.
