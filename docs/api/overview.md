# API — Přehled

**Stack:** NestJS + ts-rest + Zod  
**Port:** 3333 (výchozí, přepsatelný přes `PORT`)  
**Entry point:** `apps/api/src/main.ts`  
**Root modul:** `apps/api/src/app.module.ts`  
**OpenAPI docs:** `http://localhost:3333/docs` (swagger-ui-express, generován z contracts)

## Bootstrap

`main.ts` provede při startu:

1. Vytvoří NestJS app z `AppModule`
2. Zapne CORS — povolené origins z `CORS_ORIGIN` (comma-separated, výchozí `http://localhost:3000`)
3. Generuje OpenAPI dokument ze všech ts-rest contracts (jen pro `/docs`, není source of truth)
4. Naslouchá na portu z `process.env.PORT ?? 3333`

## Moduly (22 feature modulů)

Importy v `AppModule` v tomto pořadí:

| Modul | Soubor | Zodpovídá za |
|-------|--------|--------------|
| `ConfigModule` | `@nestjs/config` (global) | Načítání `.env` |
| `LoggingModule` | `shared/logging/` | `LoggerService`, `TraceContextService` |
| `ActivityLogModule` | `activity/activity-log.module` | Append-only audit log |
| `AgentsModule` | `agents/agents.module` | CRUD agentů + spouštění runů |
| `SkillsModule` | `skills/skills.module` | CRUD skills |
| `ProjectsModule` | `projects/projects.module` | Projekty, kategorie, matchování |
| `PipelinesModule` | `pipelines/pipelines.module` | Pipeline CRUD + orchestrace |
| `ApprovalsModule` | `approvals/approvals.module` | Schválení (všechny druhy) |
| `GateRulesModule` | `gate-rules/gate-rules.module` | Globální katalog pravidel |
| `MemoryModule` | `memory/memory.module` | Vault CRUD, grounding, search |
| `RunRecorderModule` | `memory/run-recorder.module` | Záznam outcome runů do vault |
| `ActivityRecorderModule` | `activity/activity-recorder.module` | Mapování business událostí → activity |
| `BriefingModule` | `briefing/briefing.module` | Generování briefingů |
| `AutomationsModule` | `automations/automations.module` | Cron/event triggery |
| `IntegrationsModule` | `integrations/integrations.module` | Channel adaptery, credentials |
| `MandateModule` | `mandate/mandate.module` | Operátorův scope autonomie |
| `ChannelsModule` | `channels/channels.module` | Heartbeat watcher, triage, item store |
| `HealthModule` | `health/health.module` | Health check endpoint |
| `LimitsModule` | `limits/limits.module` | Budget display |
| `EventsModule` | `events/events.module` | Interní event bus |
| `BudgetModule` | `budget/budget.module` | Budget ledger, spend tracking |
| `TasksModule` | `tasks/tasks.module` | Deferred task daemon |

## Sdílená infrastruktura (shared/)

### LoggerService + TraceContextService
- `LoggerService` poskytuje `child(name)` → `ScopedLogger` s prefixem modulu
- `TraceContextService` udržuje `traceId` a `runId` v `AsyncLocalStorage` — každý log line a activity entry je automaticky korelována
- Log level: `LOG_LEVEL` env var (debug / info / warn / error)

### FileStorage
- `file-storage/file-utils.ts` — `resolveSafeFile`, `writeFileAtomic`, `ensureDir`, `safeJson`
- `file-storage/file-lock.ts` — `withPathLock(path, fn)` pro per-soubor mutex (in-process)
- `data-dir.ts` — `ZIBBY_DATA_DIR` resolution + lock soubor zabraňující druhé instanci (in-process only — launchd garantuje jednu instanci přes Label)

### SSE (Server-Sent Events)
- `shared/sse/` — streaming log chunků na klienta bez WebSocket

## Datový adresář

Výchozí: `apps/api/data/`  
Testovací: `apps/api/data-test/` (přepnutí přes `ZIBBY_DATA_DIR=apps/api/data-test`)

```
data/
├── agents/           definice agentů (.md) + runs/<agentId>/<runId>/
├── pipelines/        definice pipeline (.pipeline.md) + runs/
├── skills/           definice skills (.SKILL.md)
├── projects/         JSON záznamy projektů
├── approvals/        JSON záznamy schválení
├── automations/      JSON záznamy automatizací
├── tasks/            JSON záznamy naplánovaných úloh
├── activity/         JSONL soubory po dnech (YYYY-MM-DD.jsonl)
├── vault/            Obsidian vault (memory/ daily/ knowledge/)
├── integrations/     JSON konfigurace integrací
├── credentials/      API klíče (odděleno od integrations)
├── budget-ledger/    JSON výdajové záznamy
├── gate-rules/       JSON globální gate pravidla
├── channels/         JSON stav channel items
└── gates/
    └── POLICY.md     Systémový floor (locked)
```

## Vývoj vs. produkce

| | Vývoj | Produkce |
|-|-------|---------|
| Příkaz | `pnpm api:dev` | `pnpm api:start` |
| Kompilátor | ts-node-dev (hot reload) | esbuild/tsc (compiled) |
| Log level | `debug` | `info` |
| Data dir | `apps/api/data` | `apps/api/data` |
| Testovací data | `pnpm api:dev:test` | — |

## Smoke test

```bash
pnpm api:smoke
```

Spustí `apps/api/scripts/claude-smoke.mjs` —ověří, že API je živé a claude CLI je dostupné.

## Seed

```bash
pnpm seed           # data/ seed
pnpm seed:test      # data-test/ seed
```

Skript `apps/api/scripts/seed.mjs` vytvoří základní agenty, pipeline a projekty.
