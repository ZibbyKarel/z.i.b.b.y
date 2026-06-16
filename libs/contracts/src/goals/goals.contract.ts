import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
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

// Goal execution has no per-kind HTTP surface: a goal run is started only by
// creating a task (`POST /api/tasks` with a `goal` target), and every run
// operation (detail, logs, resume, delete, artifacts) lives on the unified
// `taskRuns` contract under `/api/tasks/runs/*`. The `GOAL_RUN_ARTIFACTS`
// allowlist above is still the server-side guard the unified artifact endpoint
// enforces. There is intentionally no `goalRunsContract`.
