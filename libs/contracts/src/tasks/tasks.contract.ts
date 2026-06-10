import { initContract } from "@ts-rest/core"
import { ErrorSchema } from "../common.schema"
import { ClassifyTaskInputSchema, TaskRoutingSchema } from "./task.schema"

const c = initContract()

/**
 * Task routing contract. A single side-effect-free endpoint: it classifies a
 * free-text task to a stored agent or pipeline and returns the verdict — it does
 * NOT start a run. The approval-first flow keeps dispatch a separate, explicit
 * step (the web client calls the existing `agentRuns.startRun` /
 * `pipelineRuns.startPipelineRun` only when the user confirms).
 *
 * The backend has a deterministic keyword fallback behind the LLM router, so the
 * only non-200 is `422` (the catalog is empty — there is nothing to route to).
 */
export const tasksContract = c.router(
  {
    classifyTask: {
      method: "POST",
      path: "/tasks/classify",
      body: ClassifyTaskInputSchema,
      responses: {
        200: TaskRoutingSchema,
        422: ErrorSchema,
      },
      summary:
        "Classify a free-text task to a stored agent or pipeline (no side effects — does NOT start a run)",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type TasksContract = typeof tasksContract
