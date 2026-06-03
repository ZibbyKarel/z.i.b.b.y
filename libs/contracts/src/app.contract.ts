import { initContract } from "@ts-rest/core"
import { agentRunsContract } from "./agent-runs/agent-runs.contract"
import { agentsContract } from "./agents/agents.contract"
import { categoriesContract } from "./categories/categories.contract"
import { healthContract } from "./health/health.contract"
import { limitsContract } from "./limits/limits.contract"

const c = initContract()

/**
 * The whole API as one nested router — every resource contract under a named key.
 * Clients (the `@ts-rest/react-query` `tsr`, an imperative `@ts-rest/core` client,
 * the OpenAPI generator) take this single object and expose each resource as
 * `…​.health.getHealth`, `…​.agents.listAgents`, etc. Each child keeps its own
 * `pathPrefix: "/api"`, so nesting changes the call-site shape, not the URLs.
 */
export const appContract = c.router({
  agents: agentsContract,
  agentRuns: agentRunsContract,
  categories: categoriesContract,
  health: healthContract,
  limits: limitsContract,
})

export type AppContract = typeof appContract
