# Architektura Z.I.B.B.Y

## Monorepo struktura

```
z.i.b.b.y/
├── apps/
│   ├── api/          NestJS backend — port 3333
│   └── web/          Next.js 15 frontend — port 3000
├── libs/
│   ├── contracts/    @zibby/contracts — Zod schémata + ts-rest router (source of truth)
│   ├── design-system/ @zibby/design-system — UI primitives, téma, tokeny
│   └── forms/        @zibby/forms — React Hook Form + Zod adaptér nad DS
├── e2e/              Playwright end-to-end testy
├── ops/              launchd plists, backup script, newsyslog konfig
└── docs/             tato dokumentace
```

Správce balíčků: **pnpm** (workspace: protokol, pnpm-lock.yaml v9). Nikdy `npm` ani `yarn`.

## Vrstvy a závislosti

```
apps/web  ─── @zibby/contracts (ts-rest client, typy)
          ─── @zibby/design-system (UI komponenty)
          ─── @zibby/forms (formuláře)

apps/api  ─── @zibby/contracts (ts-rest server implementace)
          ─── NestJS (DI, moduly, controllers)

libs/contracts ─── zod (schémata a validace)
               ─── @ts-rest/core (contract definice)

libs/design-system ─── Tailwind v4 (CSS-first @theme)
                   ─── CVA (variant composition)
```

`libs/contracts` je jediný zdroj pravdy pro typy a API tvar — server i klient ho importují,
nikdy nedochází ke generování kódu.

## Datový tok (typický request)

```
Operator klikne v UI
  → Next.js page component
  → TanStack Query hook (useXxxMutation / useXxxQuery)
  → ts-rest client (apiClient z apps/web/state/api.ts)
  → HTTP na apps/api :3333
  → NestJS controller (@TsRestHandler)
  → Service vrstva (business logika)
  → File-based storage (ZIBBY_DATA_DIR / vault)
  → Response zpět přes ts-rest kontrakt
  → TanStack Query cache invalidace
  → React re-render
```

## Persistence — soubory jsou pravda

Všechna data jsou soubory na disku. Není žádná SQL databáze.

| Typ dat                | Formát                      | Umístění                                               |
| ---------------------- | --------------------------- | ------------------------------------------------------ |
| Agent definice         | Markdown + YAML frontmatter | `apps/api/data/agents/<id>.md`                         |
| Pipeline definice      | Markdown + YAML frontmatter | `apps/api/data/pipelines/<id>.pipeline.md`             |
| Run záznamy (sidecar)  | JSON                        | `apps/api/data/agents/<id>/runs/<runId>/sidecar.json`  |
| Run logy               | plaintext                   | `apps/api/data/agents/<id>/runs/<runId>/run.log`       |
| Schválení              | JSON                        | `apps/api/data/approvals/<id>.json`                    |
| Automatizace           | JSON                        | `apps/api/data/automations/<id>.json`                  |
| Projekty               | JSON                        | `apps/api/data/projects/<id>.json`                     |
| Naplánované úlohy      | JSON                        | `apps/api/data/tasks/<id>.json`                        |
| Activity log           | JSONL (append-only)         | `apps/api/data/activity/YYYY-MM-DD.jsonl`              |
| Memory vault           | Markdown + frontmatter      | `apps/api/data/vault/{memory,daily,knowledge}/<id>.md` |
| Integrace              | JSON                        | `apps/api/data/integrations/<id>.json`                 |
| Credentials            | JSON (odděleno)             | `apps/api/data/credentials/<integrationId>.json`       |
| Budget ledger          | JSON                        | `apps/api/data/budget-ledger/`                         |
| Gate floor (POLICY.md) | Markdown                    | `apps/api/data/gates/POLICY.md`                        |
| Global gate pravidla   | JSON                        | `apps/api/data/gate-rules/<id>.json`                   |

## Spouštění agentů (abstrakce)

```
TaskSchedulerService   ← naplánovaná/okamžitá úloha
AgentRunnerService     ← spouštění konkrétního agenta
PipelineRunnerService  ← orchestrace fází pipeline
    ↓ vše
RunnerCore             ← universal spawn engine
    ↓
child_process.spawn()  ← claude CLI (nebo jiný příkaz)
    ↓
Log soubor + sidecar JSON
```

`RunnerCore` (`apps/api/src/runner/runner-core.ts`) je centrální spawn engine —
agent runner, skill runner a pipeline stage runner jsou jen thin wrappers s vlastní
`KindStrategy` (jak sestavit sidecar record a jak ho validovat při restartu).

## Autonomní smyčka (dva módy)

### Directed (říjzený)

```
Operátor zadá úlohu (UI / API)
  → TaskSchedulerService.createTask()
  → Klasifikace (TaskClassifierService) → routing target
  → Dispatch → AgentRunnerService nebo PipelineRunnerService
  → Gate evaluace (před každým záměrem)
  → Výsledek zapsán zpět do task record
  → Activity log
```

### Autonomous (autonomní)

```
ChannelWatcherService heartbeat (každých 30s)
  → adapter.poll() → nové položky z emailu / Slacku
  → Sanitize → persist (ChannelItemStore)
  → ChannelTriageFlowService.handle()
  → Klasifikace a tier rozhodnutí (mandate)
  → Tier 1: tiše jednat | Tier 2: jednat + hlásit | Tier 3: sestavit + čekat
  → Activity log
```

## Gate policy (strukturální ochrana)

Každý záměr agenta (tool call, akce) prochází `GateEvaluatorService` **před** spuštěním:

```
IntendedAction (action, tool, scope, branch, context, metrics)
  → GateEvaluatorService.evaluate(action, rules)
  → Iterace pravidel (vlastní agenta → systémový floor)
  → První shoda → decision (allow | notify | ask | deny)
  → ask → RunnerCore.pause() → ApprovalService.create() → čekání
  → deny → RunnerCore.kill() → status: interrupted
```

Systémový floor (`POLICY.md`) je locked — agent ho může jen zpřísnit, nikdy oslabit.

## TypeScript konfigurace

- `strict: true` + `noUncheckedIndexedAccess`
- Žádný `any` — používá se `unknown`, `satisfies`, nebo generika
- Path aliases v `tsconfig.base.json`:
  - `@zibby/contracts` → `libs/contracts/src/index.ts`
  - `@zibby/design-system` → `libs/design-system/src/index.ts`
  - `@zibby/forms` → `libs/forms/src/index.ts`

## Testování

| Vrstva                 | Framework                    | Příkaz          |
| ---------------------- | ---------------------------- | --------------- |
| API unit + integration | Vitest (project: api)        | `pnpm api:test` |
| Web components         | Vitest (project: web, jsdom) | `pnpm web:test` |
| E2E                    | Playwright                   | `pnpm e2e`      |
| Design system          | Vitest + Storybook           | `pnpm test`     |

`pnpm typecheck` spouští `tsc --noEmit` pro `tsconfig.base.json` + `apps/web/tsconfig.json`.
Pozor: `rtk pnpm typecheck` filtruje výstup a maskuje chyby — vždy použít přímé `tsc`.
