import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  AttachmentSchema,
  ClassifyTaskInputSchema,
  CreateTaskInputSchema,
  CreateTaskResultSchema,
  ScheduledTaskSchema,
  TaskRoutingSchema,
} from "./task.schema";
import {
  TaskDetailSchema,
  TaskParentsPageSchema,
  TaskParentsQuerySchema,
} from "./task-parents.schema";

const c = initContract();

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
        // D-019 — a `{ kind: "chain" }` target before ZB-05a implements dispatch.
        400: ErrorSchema,
        422: ErrorSchema,
        // Claude CLI preflight refused the immediate dispatch (missing/broken CLI).
        503: ErrorSchema,
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

    uploadTaskAttachments: {
      method: "POST",
      path: "/tasks/attachments",
      contentType: "multipart/form-data",
      body: c.type<{ files: File[] }>(),
      responses: {
        201: z.object({ attachmentSetId: z.string(), files: z.array(AttachmentSchema) }),
        413: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Upload files as a durable attachment set a task can reference",
    },

    // ZB-04a §5. Declared BEFORE `getTask`'s `/tasks/:id` — @ts-rest/nest registers
    // routes in key order and Express matches first-wins, so a literal path
    // declared after a parameterised sibling would be swallowed by it (same rule
    // as `task-runs.contract.ts`'s `/tasks/runs/archive*` vs `getTaskRun`).
    getTaskParents: {
      method: "GET",
      path: "/tasks/parents",
      query: TaskParentsQuerySchema,
      responses: {
        200: TaskParentsPageSchema,
      },
      summary:
        "Cursor-paginated top-level tasks (no parentTaskId) with their subtasks summary and derived state",
    },

    getTask: {
      method: "GET",
      path: "/tasks/:id",
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: TaskDetailSchema,
        404: ErrorSchema,
      },
      summary: "Get a single task by id, including its subtasks summary",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type TasksContract = typeof tasksContract;
