import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import { AgentIdSchema } from "../agents/agent.schema"
import { AgentRunSchema, RunLogChunkSchema, StartRunSchema } from "./agent-run.schema"

const c = initContract()

/**
 * Agent execution contract — the runtime side of the agents resource (starting a
 * run, listing what's running, tailing logs, stopping). Kept separate from
 * `agentsContract` (CRUD over the definitions) but sharing the `/api/agents/*`
 * URL space. Logs are polled with a byte offset rather than streamed: the payload
 * is one-directional and append-only, the log file on disk is the source of truth,
 * so a reconnect just re-reads from offset 0 — no transport state to lose (same
 * rationale the limits/health polling already follows). SSE is a future option.
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
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type AgentRunsContract = typeof agentRunsContract
