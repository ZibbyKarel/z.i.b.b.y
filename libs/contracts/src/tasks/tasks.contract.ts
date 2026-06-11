import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ErrorSchema } from "../common.schema"
import {
  ClassifyTaskInputSchema,
  CreateTaskInputSchema,
  CreateTaskResultSchema,
  ScheduledTaskSchema,
  TaskRoutingSchema,
} from "./task.schema"

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
 *
 * `createTask` is the action endpoint behind the New Task dialog: it classifies and
 * dispatches in one call (returning the started run's ref), or — when given a future
 * `scheduledAt` — parks the task for the scheduler to fire later (returning the
 * persisted scheduled task). `classifyTask` stays as the side-effect-free verdict.
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

    createTask: {
      method: "POST",
      path: "/tasks",
      body: CreateTaskInputSchema,
      responses: {
        201: CreateTaskResultSchema,
        422: ErrorSchema,
      },
      summary:
        "Create a task — dispatch it now (classify + start a run), or schedule it for a future `scheduledAt`",
    },

    listScheduledTasks: {
      method: "GET",
      path: "/tasks/scheduled",
      responses: {
        200: z.array(ScheduledTaskSchema),
      },
      summary: "List deferred tasks (newest first)",
    },

    cancelScheduledTask: {
      method: "DELETE",
      path: "/tasks/scheduled/:id",
      responses: {
        200: ScheduledTaskSchema,
        404: ErrorSchema,
      },
      summary: "Cancel a still-waiting scheduled task",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
)

export type TasksContract = typeof tasksContract
