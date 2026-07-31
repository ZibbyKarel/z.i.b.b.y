import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { RunLogChunkSchema } from "../agents/agent-run.schema";
import { EmptyBodySchema, ErrorSchema } from "../common.schema";
import {
  ArchiveCountsQuerySchema,
  ArchiveCountsSchema,
  ArchivePageQuerySchema,
  ArchivePageSchema,
  AssignTaskRunProjectSchema,
  ResumeTaskRunSchema,
  TaskRunArtifactSchema,
  TaskRunSchema,
} from "./task-run.schema";

const c = initContract();

const RunIdParam = z.object({ runId: z.string() });

/**
 * The unified task-run surface (replaces the per-kind `agentRuns` / `pipelineRuns` /
 * `goalRuns` run routes). A task is the entity that runs; the agent/pipeline/goal that
 * processes it is metadata on the row. Every lifecycle sub-resource takes a bare
 * `runId` and the backend resolves the owning runner — run ids are not reliably
 * distinguishable by shape, so the resolver is load-bearing.
 *
 * There is no start route here on purpose: the only way to start work is `POST /tasks`
 * (create a task carrying an assigned target, or let the classifier pick one). These
 * routes are lifecycle-on-an-existing-run. Logs stay byte-offset polled (the log file
 * on disk is the source of truth — same rationale the agent run logs already follow).
 */
export const taskRunsContract = c.router(
  {
    listTaskRuns: {
      method: "GET",
      path: "/tasks/runs",
      responses: {
        200: z.array(TaskRunSchema),
      },
      summary: "The unified task feed (per-kind runs + waiting tasks, merged), newest first",
    },

    // Literal `/tasks/runs/archive*` routes MUST stay above `getTaskRun`'s
    // `/tasks/runs/:runId`: @ts-rest/nest registers routes in key order and Express
    // matches first-wins, so a parameterised sibling declared earlier swallows them.
    listArchivedTaskRuns: {
      method: "GET",
      path: "/tasks/runs/archive",
      query: ArchivePageQuerySchema,
      responses: {
        200: ArchivePageSchema,
      },
      summary: "Cursor-paginated, search/subsystem-filtered archive (newest-first)",
    },

    getArchivedTaskRunCounts: {
      method: "GET",
      path: "/tasks/runs/archive/counts",
      query: ArchiveCountsQuerySchema,
      responses: {
        200: ArchiveCountsSchema,
      },
      summary: "Per-subsystem archive counts (search-scoped) + the unsearched total",
    },

    getTaskRun: {
      method: "GET",
      path: "/tasks/runs/:runId",
      pathParams: RunIdParam,
      responses: {
        200: TaskRunSchema,
        404: ErrorSchema,
      },
      summary: "Get a single task run by id (resolves historical on-disk runs too)",
    },

    getTaskRunLogs: {
      method: "GET",
      path: "/tasks/runs/:runId/logs",
      pathParams: RunIdParam,
      query: z.object({
        offset: z.coerce.number().int().nonnegative().optional(),
      }),
      responses: {
        200: RunLogChunkSchema,
        404: ErrorSchema,
      },
      summary: "Read an agent (or goal-child agent) run's log from a byte offset",
    },

    getTaskRunStageLogs: {
      method: "GET",
      path: "/tasks/runs/:runId/stages/:phaseId/logs",
      pathParams: z.object({ runId: z.string(), phaseId: z.string() }),
      query: z.object({ offset: z.coerce.number().int().nonnegative().optional() }),
      responses: {
        200: RunLogChunkSchema,
        404: ErrorSchema,
      },
      summary: "Read a pipeline run's stage log from a byte offset",
    },

    getTaskRunArtifact: {
      method: "GET",
      path: "/tasks/runs/:runId/artifacts/:name",
      pathParams: z.object({ runId: z.string(), name: z.string() }),
      responses: {
        200: TaskRunArtifactSchema,
        404: ErrorSchema,
      },
      summary: "Read a whitelisted run artifact (PR draft, diffstat, verdict, handoffs)",
    },

    stopTaskRun: {
      method: "POST",
      path: "/tasks/runs/:runId/stop",
      pathParams: RunIdParam,
      body: EmptyBodySchema,
      responses: {
        200: TaskRunSchema,
        404: ErrorSchema,
        // The run isn't currently running, or its kind has no stop (chain/scheduled).
        409: ErrorSchema,
      },
      summary: "Stop a running task (agent, pipeline, or goal runs)",
    },

    resumeTaskRun: {
      method: "POST",
      path: "/tasks/runs/:runId/resume",
      pathParams: RunIdParam,
      body: ResumeTaskRunSchema,
      responses: {
        200: TaskRunSchema,
        404: ErrorSchema,
        // The run's kind/state has no resume: a running run, or an agent run that
        // has not ended in error/interrupted, or a pipeline/goal run that isn't parked.
        409: ErrorSchema,
      },
      summary:
        "Resume a run: a parked pipeline/goal run (with an operator note), or re-run an " +
        "errored/interrupted agent run (returns the NEW run — with --resume when a session " +
        "id was captured, else a fresh run of the same task)",
    },

    deleteTaskRun: {
      method: "DELETE",
      path: "/tasks/runs/:runId",
      pathParams: RunIdParam,
      responses: {
        200: z.object({ runId: z.string() }),
        404: ErrorSchema,
      },
      summary: "Delete a run and all its artifacts",
    },

    assignTaskRunProject: {
      method: "PATCH",
      path: "/tasks/runs/:runId/project",
      pathParams: RunIdParam,
      body: AssignTaskRunProjectSchema,
      responses: {
        200: TaskRunSchema,
        404: ErrorSchema,
      },
      summary:
        "Assign a run into a project, or clear it back to 'bez projektu' with a null projectId",
    },
  },
  {
    pathPrefix: "/api",
    strictStatusCodes: true,
  },
);

export type TaskRunsContract = typeof taskRunsContract;
