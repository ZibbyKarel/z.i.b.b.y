import { initContract } from "@ts-rest/core"
import { activityContract } from "./activity/activity.contract"
import { agentRunsContract, agentsContract } from "./agents/agents.contract"
import { briefingContract } from "./briefing/briefing.contract"
import { budgetContract } from "./budget/budget.contract"
import { approvalsContract } from "./approvals/approvals.contract"
import { gatesContract } from "./gates/gate.contract"
import { gateRulesContract } from "./gates/gate-rules.contract"
import { automationsContract } from "./automations/automations.contract"
import { channelsContract } from "./channels/channels.contract"
import { integrationsContract } from "./integrations/integrations.contract"
import { mandateContract } from "./mandate/mandate.contract"
import { memoryContract } from "./memory/memory.contract"
import {
  categoriesContract,
  projectCategoriesContract,
  skillCategoriesContract,
} from "./categories/categories.contract"
import { healthContract } from "./health/health.contract"
import { limitsContract } from "./limits/limits.contract"
import { pipelineRunsContract, pipelinesContract } from "./pipelines/pipelines.contract"
import { goalRunsContract, goalsContract } from "./goals/goals.contract"
import { projectsContract } from "./projects/projects.contract"
import { skillsContract } from "./skills/skills.contract"
import { tasksContract } from "./tasks/tasks.contract"

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
  skills: skillsContract,
  skillCategories: skillCategoriesContract,
  projects: projectsContract,
  projectCategories: projectCategoriesContract,
  pipelines: pipelinesContract,
  pipelineRuns: pipelineRunsContract,
  goals: goalsContract,
  goalRuns: goalRunsContract,
  approvals: approvalsContract,
  gates: gatesContract,
  gateRules: gateRulesContract,
  memory: memoryContract,
  automations: automationsContract,
  integrations: integrationsContract,
  channels: channelsContract,
  mandate: mandateContract,
  health: healthContract,
  limits: limitsContract,
  tasks: tasksContract,
  activity: activityContract,
  briefing: briefingContract,
  budget: budgetContract,
})

export type AppContract = typeof appContract
