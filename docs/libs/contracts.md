# Contracts (@zibby/contracts)

**Path:** `libs/contracts/src/`
**Import alias:** `@zibby/contracts`

`libs/contracts` is the **single source of truth** for API types and shape —
both server and client import it. No codegen, no duplication.

## What it contains

Each domain has its own folder with:

- `<domain>.schema.ts` — Zod schemas + TypeScript types (derived via `z.infer`)
- `<domain>.contract.ts` — a ts-rest router with HTTP methods, endpoints, and
  body/query/response types

All exports are re-exported from `libs/contracts/src/index.ts`.

## Domains

35 domain folders exist today under `libs/contracts/src/` (every one below,
excluding the composite `app.contract.ts` and the shared `common.schema.ts`):

| Folder            | Key schema(s)                                                                                                                    | Contract                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `agents/`         | `AgentSchema`, `AgentRunSchema`                                                                                                  | Agent CRUD + runs                                                                        |
| `categories/`     | `CategorySchema`                                                                                                                 | Agent/skill/project categories                                                           |
| `skills/`         | `SkillSchema`                                                                                                                    | Skill CRUD                                                                               |
| `hooks/`          | `HookSchema`                                                                                                                     | Hook catalog CRUD                                                                        |
| `mcp/`            | `McpServerSchema`                                                                                                                | MCP server catalog CRUD                                                                  |
| `commands/`       | `CommandSchema`                                                                                                                  | Slash-command catalog CRUD                                                               |
| `projects/`       | `ProjectSchema`                                                                                                                  | Projects                                                                                 |
| `companies/`      | `CompanySchema`                                                                                                                  | Company registry CRUD — the super-entity above `Project`                                 |
| `pipelines/`      | `PipelineSchema`, `PipelineRunSchema`, `StageVerdictSchema`                                                                      | Pipeline CRUD + runs                                                                     |
| `goals/`          | `GoalSchema`, `GoalRunSchema`                                                                                                    | Loop-engine goal definitions + runs                                                      |
| `approvals/`      | `ApprovalSchema`                                                                                                                 | Approval queue                                                                           |
| `artifacts/`      | `ArtifactSchema`                                                                                                                 | Durable artifact provenance registry                                                     |
| `chains/`         | `ChainSchema`                                                                                                                    | Completion-driven task chains                                                            |
| `discovery/`      | `ProposalSchema`                                                                                                                 | Triaged proposal → task flow                                                             |
| `gates/`          | `GateRuleSchema`, `MatchConditionSchema`, `ResolveSchema` (plus the nested `gate-rules.contract.ts` for the global rule catalog) | Gate rules                                                                               |
| `memory/`         | `NoteSchema`, `IndexEntrySchema`, `MemoryGraphSchema`                                                                            | Vault operations                                                                         |
| `machine/`        | machine-action schemas                                                                                                           | Propose-only machine actions + open-maps                                                 |
| `monitors/`       | `MonitorSchema`                                                                                                                  | CI/CD monitor adapters                                                                   |
| `automations/`    | `AutomationSchema`                                                                                                               | Scheduled automations                                                                    |
| `integrations/`   | `IntegrationSchema`                                                                                                              | Channel integrations                                                                     |
| `channels/`       | `ChannelItemSchema`                                                                                                              | Inbound channel items                                                                    |
| `mandate/`        | `MandateSchema`                                                                                                                  | Autonomy scope                                                                           |
| `health/`         | `HealthStatusSchema`                                                                                                             | System health status                                                                     |
| `subsystems/`     | `SubsystemSchema`, `SubsystemWithStatusSchema`                                                                                   | GAIA-style federation registry (8 named subsystems) + status                             |
| `self/`           | `SelfStatusSchema`, `SelfUpdateResultSchema`                                                                                     | The ZIBBY install repo's own freshness + operator-triggered self-update                  |
| `self-knowledge/` | `SelfKnowledgeSchema`, `SelfKnowledgeSectionsSchema`                                                                             | The machine-generated self-knowledge snapshot (read-only; regeneration is a CLI concern) |
| `limits/`         | `LimitsSchema`                                                                                                                   | Budget and rate limits                                                                   |
| `system/`         | system-config schemas                                                                                                            | Runtime system config + policy floor                                                     |
| `pins/`           | `PinSchema`                                                                                                                      | Quick-launch pins                                                                        |
| `tasks/`          | `ScheduledTaskSchema`, `TaskRoutingSchema`, `TaskRunSchema` (`task-run.schema.ts`)                                               | Deferred tasks + the unified run surface (`task-runs.contract.ts`)                       |
| `activity/`       | `ActivityEntrySchema`, `ActivityKindSchema`, `ActivityRefsSchema` (plus `activity-view.schema.ts`)                               | Audit log + view config                                                                  |
| `briefing/`       | `BriefingItemSchema`                                                                                                             | Briefing                                                                                 |
| `budget/`         | `BudgetSchema`                                                                                                                   | Spend ledger and caps                                                                    |
| `chat/`           | chat message/session schemas                                                                                                     | Chat-first interface backend                                                             |
| `speech/`         | `SpeechSynthesizeInputSchema`, `SpeechVoiceSchema`, `SpeechStatusSchema`                                                         | Thin proxy in front of the local `speakd` TTS daemon                                     |

## Shared schema (common.schema.ts)

```typescript
// Error response body
const ErrorSchema = z.object({ message: z.string() });

// ISO 8601 date-time, used for every timestamp field across the contracts
const IsoDateTimeSchema = z.string().datetime();

// Shared run lifecycle, across every run kind (agent, skill, pipeline stage).
// `awaiting-approval` and `paused-limit` are both *safe paused states with no
// live child* — each survives a restart unchanged rather than being
// reconciled to `interrupted`.
const RunStatusSchema = z.enum([
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
  "paused-limit",
]);

// Risk hint (display-only — the gate policy engine decides; `risk` only colors the UI badge)
const RiskSchema = z.enum(["low", "medium", "high"]);

// Git worktree a run owns
const WorkspaceSchema = z.object({
  branch: z.string(),
  path: z.string(),
  baseRef: z.string(),
});
```

## How ts-rest works

### Contract definition (libs/contracts)

```typescript
// libs/contracts/src/agents/agents.contract.ts
import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { AgentSchema, CreateAgentInputSchema } from "./agent.schema";

const c = initContract();

export const agentsContract = c.router({
  listAgents: {
    method: "GET",
    path: "/agents",
    responses: { 200: z.array(AgentSchema) },
  },
  createAgent: {
    method: "POST",
    path: "/agents",
    body: CreateAgentSchema,
    responses: {
      201: AgentSchema,
      409: ErrorSchema,
    },
  },
  // ...
});
```

### Server implementation (apps/api)

```typescript
// apps/api/src/agents/agents.controller.ts
@Controller()
export class AgentsController {
  constructor(private readonly service: AgentsStorageService) {}

  @TsRestHandler(agentsContract)
  async handler() {
    return tsRestHandler(agentsContract, {
      listAgents: async () => {
        const agents = await this.service.list();
        return { status: 200 as const, body: agents };
      },
      createAgent: async ({ body }) => {
        const agent = await this.service.create(body);
        return { status: 201 as const, body: agent };
      },
    });
  }
}
```

### Client call (apps/web)

```typescript
// apps/web/state/api.ts
import { initTsrReactQuery } from "@ts-rest/react-query/v5";
import { appContract } from "@zibby/contracts";

export const apiClient = initTsrReactQuery(appContract, {
  baseUrl: API_URL,
  baseHeaders: { accept: "application/json" },
  validateResponse: true,
});

// In a hook:
const { data } = apiClient.agents.listAgents.useQuery({
  queryKey: ["agents"],
  select: selectApiResponseBody,
});
```

## Validation

- Every schema is Zod → runtime validation with no extra codegen overhead
- ts-rest validates body/query automatically on both server and client
- Invalid input → HTTP 400/422 with an `ErrorSchema` body
- Tests live in `*.contract.test.ts` files (e.g. `agents.contract.test.ts`,
  `gate-rules.contract.test.ts`)

## ID regex conventions

```typescript
// Agent, pipeline, skill id
const AGENT_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

// Note id (vault)
const NoteIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/);

// Gate rule id
const GateRuleIdSchema = z.string().regex(/^[a-zA-Z0-9._-]+$/);
```

Filesystem-safe identifiers — no path separators, no `..`.

## App contract (app.contract.ts)

The composite router that merges every domain contract:

```typescript
export const appContract = c.router({
  agents: agentsContract,
  agentRuns: agentRunsContract, // now just GET /agents/running (catalog liveness)
  categories: categoriesContract,
  skills: skillsContract,
  skillCategories: skillCategoriesContract,
  hooks: hooksContract,
  commands: commandsContract,
  projects: projectsContract,
  projectCategories: projectCategoriesContract,
  companies: companiesContract,
  pipelines: pipelinesContract,
  pipelineRuns: pipelineRunsContract, // now just GET /pipelines/runs (catalog liveness)
  goals: goalsContract,
  approvals: approvalsContract,
  artifacts: artifactsContract,
  chains: chainsContract,
  chainRuns: chainRunsContract,
  discovery: discoveryContract,
  gates: gatesContract,
  gateRules: gateRulesContract,
  memory: memoryContract,
  machine: machineContract,
  monitors: monitorsContract,
  automations: automationsContract,
  integrations: integrationsContract,
  mcpServers: mcpContract,
  channels: channelsContract,
  mandate: mandateContract,
  health: healthContract,
  subsystems: subsystemsContract,
  self: selfContract,
  selfKnowledge: selfKnowledgeContract,
  limits: limitsContract,
  tasks: tasksContract,
  taskRuns: taskRunsContract, // unified run surface: /api/tasks/runs/*
  system: systemContract,
  pins: pinsContract,
  activity: activityContract,
  activityView: activityViewContract,
  briefing: briefingContract,
  budget: budgetContract,
  chat: chatContract,
  speech: speechContract,
  // ... (no goalRunsContract — goal runs live on taskRuns)
});
```

Used to generate OpenAPI documentation in `main.ts`.

> **Unified run surface.** Per-kind run routes (`POST /:id/run`, run history,
> detail, logs, stop, resume, delete, artifacts) were removed. A run is
> started only via a task (`POST /api/tasks`), and every operation on a run
> lives on `taskRunsContract` under `/api/tasks/runs/*`. `agentRunsContract`
> and `pipelineRunsContract` only keep their liveness listings; the former
> `goalRunsContract` was removed entirely — goal runs share the task-run
> surface. The run **schemas** (`AgentRunSchema`, `PipelineRunSchema`,
> `GoalRunSchema`) remain and are shared via `task-run.schema`.
