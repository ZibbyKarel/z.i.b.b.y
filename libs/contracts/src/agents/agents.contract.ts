import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  AgentIdSchema,
  AgentSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
} from "./agent.schema"
import { AgentRunSchema, RunLogChunkSchema, StartRunSchema } from "./agent-run.schema"

const c = initContract()

/**
 * Single source of truth for the agents API. The NestJS backend implements this
 * contract via `@ts-rest/nest`; a future frontend can consume the very same
 * object with a `@ts-rest` client — no codegen, types flow through inference.
 */
export const agentsContract = c.router(
  {
    createAgent: {
      method: "POST",
      path: "/agents",
      body: CreateAgentSchema,
      responses: {
        201: AgentSchema,
        409: ErrorSchema,
      },
      summary: "Create a new agent",
    },

    listAgents: {
      method: "GET",
      path: "/agents",
      responses: {
        200: z.array(AgentSchema),
      },
      summary: "List all agents",
    },

    // Declared before `getAgent` so `/agents/search` is matched as its own route
    // rather than captured by the `/agents/:id` param.
    searchAgents: {
      method: "GET",
      path: "/agents/search",
      query: z.object({ q: z.string() }),
      responses: {
        200: z.array(AgentSchema),
      },
      summary: "Search agents by id, name, description or category",
    },

    getAgent: {
      method: "GET",
      path: "/agents/:id",
      pathParams: z.object({ id: AgentIdSchema }),
      responses: {
        200: AgentSchema,
        404: ErrorSchema,
      },
      summary: "Get a single agent by id",
    },

    updateAgent: {
      method: "PATCH",
      path: "/agents/:id",
      pathParams: z.object({ id: AgentIdSchema }),
      body: UpdateAgentSchema,
      responses: {
        200: AgentSchema,
        404: ErrorSchema,
      },
      summary: "Partially update an existing agent",
    },

    deleteAgent: {
      method: "DELETE",
      path: "/agents/:id",
      pathParams: z.object({ id: AgentIdSchema }),
      responses: {
        200: z.object({ id: AgentIdSchema }),
        404: ErrorSchema,
      },
      summary: "Delete an agent",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type AgentsContract = typeof agentsContract

/**
 * Agent execution contract — the runtime side of the agents resource (starting a
 * run, listing what's running, tailing logs, stopping). Kept a separate router
 * from `agentsContract` (CRUD over the definitions) but co-located here and
 * sharing the `/api/agents/*` URL space. Logs are polled with a byte offset
 * rather than streamed: the payload is one-directional and append-only, the log
 * file on disk is the source of truth, so a reconnect just re-reads from offset 0
 * — no transport state to lose (same rationale the limits/health polling already
 * follows). SSE is a future option.
 */
export const agentRunsContract = c.router(
  {
    startRun: {
      method: "POST",
      path: "/agents/:id/run",
      pathParams: z.object({ id: AgentIdSchema }),
      body: StartRunSchema,
      responses: {
        201: AgentRunSchema,
        404: ErrorSchema,
        // Claude CLI preflight refused the start (missing/broken CLI).
        503: ErrorSchema,
      },
      summary: "Start a run of an agent",
    },

    listRunning: {
      method: "GET",
      path: "/agents/running",
      responses: {
        200: z.array(AgentRunSchema),
      },
      summary: "List currently running (and just-finished) agent runs",
    },

    listRuns: {
      method: "GET",
      path: "/agents/runs",
      responses: {
        200: z.array(AgentRunSchema),
      },
      summary: "List the full agent run history (on disk + in memory), newest first",
    },

    getRun: {
      method: "GET",
      path: "/agents/runs/:runId",
      pathParams: z.object({ runId: z.string() }),
      responses: {
        200: AgentRunSchema,
        404: ErrorSchema,
      },
      summary: "Get a single run by id",
    },

    getRunLogs: {
      method: "GET",
      path: "/agents/runs/:runId/logs",
      pathParams: z.object({ runId: z.string() }),
      query: z.object({
        offset: z.coerce.number().int().nonnegative().optional(),
      }),
      responses: {
        200: RunLogChunkSchema,
        404: ErrorSchema,
      },
      summary: "Read a run's log from a byte offset",
    },

    stopRun: {
      method: "POST",
      path: "/agents/runs/:runId/stop",
      pathParams: z.object({ runId: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: AgentRunSchema,
        404: ErrorSchema,
      },
      summary: "Stop a running agent",
    },

    deleteRun: {
      method: "DELETE",
      path: "/agents/runs/:runId",
      pathParams: z.object({ runId: z.string() }),
      responses: {
        200: z.object({ runId: z.string() }),
        404: ErrorSchema,
      },
      summary: "Delete a run and all its artifacts",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type AgentRunsContract = typeof agentRunsContract
