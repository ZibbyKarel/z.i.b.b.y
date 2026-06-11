import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { RunLogChunkSchema } from "../agents/agent-run.schema"
import { ErrorSchema } from "../common.schema"
import { PipelineRunSchema, StartPipelineRunSchema } from "./pipeline-run.schema"
import {
  CreatePipelineSchema,
  PipelineSchema,
  UpdatePipelineSchema,
} from "./pipeline.schema"

const c = initContract()

const PipelineIdParam = z.object({ id: z.string().min(1) })

/** CRUD over pipeline definitions (`.pipeline.md` files). Mirrors `agentsContract`. */
export const pipelinesContract = c.router(
  {
    createPipeline: {
      method: "POST",
      path: "/pipelines",
      body: CreatePipelineSchema,
      responses: { 201: PipelineSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create a new pipeline",
    },
    listPipelines: {
      method: "GET",
      path: "/pipelines",
      responses: { 200: z.array(PipelineSchema) },
      summary: "List all pipelines",
    },
    getPipeline: {
      method: "GET",
      path: "/pipelines/:id",
      pathParams: PipelineIdParam,
      responses: { 200: PipelineSchema, 404: ErrorSchema },
      summary: "Get a single pipeline by id",
    },
    updatePipeline: {
      method: "PATCH",
      path: "/pipelines/:id",
      pathParams: PipelineIdParam,
      body: UpdatePipelineSchema,
      responses: { 200: PipelineSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Partially update an existing pipeline",
    },
    deletePipeline: {
      method: "DELETE",
      path: "/pipelines/:id",
      pathParams: PipelineIdParam,
      responses: { 200: z.object({ id: z.string() }), 404: ErrorSchema },
      summary: "Delete a pipeline",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type PipelinesContract = typeof pipelinesContract

/** Pipeline execution — start a run, poll the aggregate, tail a stage's log. */
export const pipelineRunsContract = c.router(
  {
    startPipelineRun: {
      method: "POST",
      path: "/pipelines/:id/run",
      pathParams: PipelineIdParam,
      body: StartPipelineRunSchema,
      // 503: the Claude CLI preflight refused the start (claude mode only).
      responses: { 201: PipelineRunSchema, 404: ErrorSchema, 503: ErrorSchema },
      summary: "Start a run of a pipeline",
    },
    listPipelineRuns: {
      method: "GET",
      path: "/pipelines/runs",
      responses: { 200: z.array(PipelineRunSchema) },
      summary: "List currently running (and just-finished) pipeline runs",
    },
    listAllPipelineRuns: {
      method: "GET",
      path: "/pipelines/run-history",
      responses: { 200: z.array(PipelineRunSchema) },
      summary: "List the full pipeline run history (on disk + in memory), newest first",
    },
    getPipelineRun: {
      method: "GET",
      path: "/pipelines/runs/:pipelineRunId",
      pathParams: z.object({ pipelineRunId: z.string() }),
      responses: { 200: PipelineRunSchema, 404: ErrorSchema },
      summary: "Get a single pipeline run by id",
    },
    getStageRunLogs: {
      method: "GET",
      path: "/pipelines/runs/:pipelineRunId/stages/:phaseId/logs",
      pathParams: z.object({ pipelineRunId: z.string(), phaseId: z.string() }),
      query: z.object({ offset: z.coerce.number().int().nonnegative().optional() }),
      responses: { 200: RunLogChunkSchema, 404: ErrorSchema },
      summary: "Read a pipeline stage's log from a byte offset",
    },
    deletePipelineRun: {
      method: "DELETE",
      path: "/pipelines/runs/:pipelineRunId",
      pathParams: z.object({ pipelineRunId: z.string() }),
      responses: { 200: z.object({ pipelineRunId: z.string() }), 404: ErrorSchema },
      summary: "Delete a pipeline run and all its artifacts",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
)
export type PipelineRunsContract = typeof pipelineRunsContract
