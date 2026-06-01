import { initContract } from "@ts-rest/core"
import { z } from "zod"
import {
  AgentIdSchema,
  AgentSchema,
  CreateAgentSchema,
  ErrorSchema,
  UpdateAgentSchema,
} from "./agent.schema"

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
