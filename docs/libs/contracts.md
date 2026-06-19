# Contracts (@zibby/contracts)

**Cesta:** `libs/contracts/src/`  
**Importní alias:** `@zibby/contracts`

`libs/contracts` je **jediný zdroj pravdy** pro API typy a tvar — server i klient ho importují.
Žádný codegen, žádné duplicity.

## Co obsahuje

Každá doména má vlastní složku s:

- `<domain>.schema.ts` — Zod schémata + TypeScript typy (odvozené přes `z.infer`)
- `<domain>.contract.ts` — ts-rest router s HTTP metodami, endpointy, body/query/response typy

Všechny exporty re-exportovány z `libs/contracts/src/index.ts`.

## Domény

| Složka          | Klíčové schéma                                                    | Contract                  |
| --------------- | ----------------------------------------------------------------- | ------------------------- |
| `agents/`       | `AgentSchema`, `AgentRunSchema`                                   | CRUD + runy agentů        |
| `skills/`       | `SkillSchema`                                                     | CRUD skills               |
| `categories/`   | `CategorySchema`                                                  | Kategorie agentů a skills |
| `pipelines/`    | `PipelineSchema`, `PipelineRunSchema`                             | CRUD + runy pipelines     |
| `approvals/`    | `ApprovalSchema`                                                  | Schválení                 |
| `gates/`        | `GateRuleSchema`, `MatchConditionSchema`, `ResolveSchema`         | Gate pravidla             |
| `memory/`       | `NoteSchema`, `IndexEntrySchema`, `MemoryGraphSchema`             | Vault operace             |
| `activity/`     | `ActivityEntrySchema`, `ActivityKindSchema`, `ActivityRefsSchema` | Audit log                 |
| `automations/`  | `AutomationSchema`                                                | Plánované automatizace    |
| `projects/`     | `ProjectSchema`                                                   | Projekty                  |
| `tasks/`        | `ScheduledTaskSchema`, `TaskRoutingSchema`                        | Deferred tasks            |
| `integrations/` | `IntegrationSchema`                                               | Kanálové integrace        |
| `channels/`     | `ChannelItemSchema`                                               | Příchozí položky z kanálů |
| `mandate/`      | `MandateSchema`                                                   | Scope autonomie           |
| `health/`       | `HealthStatusSchema`                                              | Zdravotní stav systému    |
| `limits/`       | `LimitsSchema`                                                    | Budget a limity           |
| `budget/`       | `BudgetSchema`                                                    | Výdajový ledger           |
| `briefing/`     | `BriefingItemSchema`                                              | Briefing                  |
| `gate-rules/`   | `GlobalGateRuleSchema`                                            | Globální katalog pravidel |

## Sdílené schéma (common.schema.ts)

```typescript
// Odpověď při chybě
const ErrorSchema = z.object({ message: z.string() });

// Sdílený lifecycle runů
const RunStatusSchema = z.enum(["running", "done", "error", "interrupted", "awaiting-approval"]);

// Risk hint (display-only)
const RiskSchema = z.enum(["low", "medium", "high"]);

// Git worktree
const WorkspaceSchema = z.object({
  branch: z.string(),
  path: z.string(),
  baseRef: z.string(),
});
```

## Jak funguje ts-rest

### Definice kontraktu (libs/contracts)

```typescript
// libs/contracts/src/agents/agents.contract.ts
import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { AgentSchema, CreateAgentInputSchema } from "./agent.schema";

const c = initContract();

export const agentsContract = c.router({
  list: {
    method: "GET",
    path: "/api/agents",
    responses: { 200: z.array(AgentSchema) },
  },
  create: {
    method: "POST",
    path: "/api/agents",
    body: CreateAgentInputSchema,
    responses: {
      201: AgentSchema,
      422: ErrorSchema,
    },
  },
  // ...
});
```

### Implementace na serveru (apps/api)

```typescript
// apps/api/src/agents/agents.controller.ts
@Controller()
export class AgentsController {
  constructor(private readonly service: AgentsStorageService) {}

  @TsRestHandler(agentsContract)
  async handler() {
    return tsRestHandler(agentsContract, {
      list: async () => {
        const agents = await this.service.list();
        return { status: 200 as const, body: agents };
      },
      create: async ({ body }) => {
        const agent = await this.service.create(body);
        return { status: 201 as const, body: agent };
      },
    });
  }
}
```

### Volání na klientovi (apps/web)

```typescript
// apps/web/state/api.ts
import { initQueryClient } from "@ts-rest/react-query";
import { agentsContract } from "@zibby/contracts";

export const apiClient = initQueryClient(appContract, {
  baseUrl: "http://localhost:3333",
  baseHeaders: {},
});

// V hooku:
const { data } = apiClient.agents.list.useQuery(["agents"], {}, { select: selectApiResponseBody });
```

## Validace

- Všechna schémata jsou Zod → runtime validace bez zbytečného overhead
- ts-rest validuje body/query automaticky na serveru i klientovi
- Chybné vstupy → HTTP 400/422 s `ErrorSchema` body
- Testy v `contracts.test.ts` souborech (zejména `agents.contract.test.ts`)

## ID regex konvence

```typescript
// Agent, pipeline, skill id
const AGENT_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

// Note id (vault)
const NoteIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/);

// Gate rule id
const GateRuleIdSchema = z.string().regex(/^[a-zA-Z0-9._-]+$/);
```

Filesystem-safe identifikátory — žádné path separátory, žádné `..`.

## App contract (app.contract.ts)

Kompozitní router který slučuje všechny dílčí contracts:

```typescript
export const appContract = initContract().router({
  agents: agentsContract,
  agentRuns: agentRunsContract, // už jen GET /agents/running (katalogová živost)
  skills: skillsContract,
  pipelines: pipelinesContract,
  pipelineRuns: pipelineRunsContract, // už jen GET /pipelines/runs (katalogová živost)
  taskRuns: taskRunsContract, // jednotný run povrch: /api/tasks/runs/*
  // ... všechny ostatní (žádný goalRunsContract — goal běhy žijí na taskRuns)
});
```

Používá se pro generování OpenAPI dokumentace v `main.ts`.

> **Jednotný run povrch.** Per-kind run routy (`POST /:id/run`, run-history,
> detail, logy, stop, resume, delete, artefakty) byly zrušeny. Run se spouští jen
> přes úlohu (`POST /api/tasks`) a všechny operace nad během žijí na
> `taskRunsContract` pod `/api/tasks/runs/*`. Z `agentRunsContract` /
> `pipelineRunsContract` zůstaly jen živostní výpisy; `goalRunsContract` byl
> smazán celý. Run **schémata** (`AgentRunSchema`, `PipelineRunSchema`,
> `GoalRunSchema`) zůstávají — sdílí je `task-run.schema`.
