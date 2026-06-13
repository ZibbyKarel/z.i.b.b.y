import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  GoalRunSchema,
  ResumeGoalRunSchema,
  StartGoalRunSchema,
} from "./goal-run.schema"
import { CreateGoalSchema, GoalSchema, UpdateGoalSchema } from "./goal.schema"

const c = initContract()

const GoalIdParam = z.object({ id: z.string().min(1) })

/** The names a goal run artifact may have — the allowlist the artifact endpoint enforces. */
export const GOAL_RUN_ARTIFACTS = [
  "objective.md",
  "verdict.txt",
  "resume-context.md",
] as const

/** One whitelisted goal run artifact: its name and its text content. */
export const GoalRunArtifactSchema = z.object({
  name: z.enum(GOAL_RUN_ARTIFACTS),
  content: z.string(),
})
export type GoalRunArtifact = z.infer<typeof GoalRunArtifactSchema>

/** CRUD over goal definitions (`.goal.md` files). Mirrors `agentsContract`/`pipelinesContract`. */
export const goalsContract = c.router(
  {
    createGoal: {
      method: "POST",
      path: "/goals",
      body: CreateGoalSchema,
      responses: { 201: GoalSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create a new goal",
    },
    listGoals: {
      method: "GET",
      path: "/goals",
      responses: { 200: z.array(GoalSchema) },
      summary: "List all goals",
    },
    getGoal: {
      method: "GET",
      path: "/goals/:id",
      pathParams: GoalIdParam,
      responses: { 200: GoalSchema, 404: ErrorSchema },
      summary: "Get a single goal by id",
    },
    updateGoal: {
      method: "PATCH",
      path: "/goals/:id",
      pathParams: GoalIdParam,
      body: UpdateGoalSchema,
      responses: { 200: GoalSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Partially update an existing goal",
    },
    deleteGoal: {
      method: "DELETE",
      path: "/goals/:id",
      pathParams: GoalIdParam,
      responses: { 200: z.object({ id: z.string() }), 404: ErrorSchema },
      summary: "Delete a goal",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type GoalsContract = typeof goalsContract

/** Goal execution — start the outer loop, poll the run aggregate, resume a parked run. */
export const goalRunsContract = c.router(
  {
    startGoalRun: {
      method: "POST",
      path: "/goals/:id/run",
      pathParams: GoalIdParam,
      body: StartGoalRunSchema,
      // 503: the Claude CLI preflight refused the start (claude mode only).
      responses: { 201: GoalRunSchema, 404: ErrorSchema, 503: ErrorSchema },
      summary: "Start a run of a goal",
    },
    listGoalRuns: {
      method: "GET",
      path: "/goals/runs",
      responses: { 200: z.array(GoalRunSchema) },
      summary: "List currently running (and just-finished) goal runs",
    },
    listAllGoalRuns: {
      method: "GET",
      path: "/goals/run-history",
      responses: { 200: z.array(GoalRunSchema) },
      summary: "List the full goal run history (on disk + in memory), newest first",
    },
    getGoalRun: {
      method: "GET",
      path: "/goals/runs/:goalRunId",
      pathParams: z.object({ goalRunId: z.string() }),
      responses: { 200: GoalRunSchema, 404: ErrorSchema },
      summary: "Get a single goal run by id",
    },
    resumeGoalRun: {
      method: "POST",
      path: "/goals/runs/:goalRunId/resume",
      pathParams: z.object({ goalRunId: z.string() }),
      body: ResumeGoalRunSchema,
      // 409: the run is not parked (a running / paused-limit run resumes only via its own machine).
      responses: { 200: GoalRunSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Resume a parked goal run with an operator note",
    },
    getGoalRunArtifact: {
      method: "GET",
      path: "/goals/runs/:goalRunId/artifacts/:name",
      pathParams: z.object({ goalRunId: z.string(), name: z.string() }),
      responses: { 200: GoalRunArtifactSchema, 404: ErrorSchema },
      summary: "Read a whitelisted goal run artifact",
    },
    deleteGoalRun: {
      method: "DELETE",
      path: "/goals/runs/:goalRunId",
      pathParams: z.object({ goalRunId: z.string() }),
      responses: { 200: z.object({ goalRunId: z.string() }), 404: ErrorSchema },
      summary: "Delete a goal run and all its artifacts",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type GoalRunsContract = typeof goalRunsContract
