import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { DeleteResponseSchema, ErrorSchema } from "../common.schema";
import { AgentIdSchema, AgentSchema, CreateAgentSchema, UpdateAgentSchema } from "./agent.schema";
import { AgentRunSchema } from "./agent-run.schema";

const c = initContract();

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
        200: DeleteResponseSchema,
        404: ErrorSchema,
      },
      summary: "Delete an agent",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type AgentsContract = typeof agentsContract;

/**
 * Agent catalog-liveness contract — the one runtime endpoint that survives the
 * run-surface unification: the "what's running now" list that feeds the catalog
 * badges and the Overview running-agents panel. Every other run operation (start,
 * detail, logs, stop, resume, delete, artifacts) now lives on the unified
 * `taskRuns` contract under `/api/tasks/runs/*` — a run is started only by
 * creating a task, never by a direct per-kind route. Kept a separate router from
 * `agentsContract` (CRUD over the definitions) but co-located here, sharing the
 * `/api/agents/*` URL space.
 */
export const agentRunsContract = c.router(
  {
    listRunning: {
      method: "GET",
      path: "/agents/running",
      responses: {
        200: z.array(AgentRunSchema),
      },
      summary: "List currently running (and just-finished) agent runs",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type AgentRunsContract = typeof agentRunsContract;
