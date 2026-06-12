import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { RunLogChunkSchema } from "../agents/agent-run.schema"
import { ErrorSchema } from "../common.schema"
import {
  PipelineRunSchema,
  ResumePipelineRunSchema,
  StartPipelineRunSchema,
} from "./pipeline-run.schema"
import {
  CreatePipelineSchema,
  PipelineSchema,
  UpdatePipelineSchema,
} from "./pipeline.schema"

const c = initContract()

const PipelineIdParam = z.object({ id: z.string().min(1) })

/** The names a run artifact may have — the allowlist the artifact endpoint enforces. */
export const PIPELINE_RUN_ARTIFACTS = [
  "pr-draft.md",
  "diffstat.txt",
  "plan.md",
  "implementation.md",
  "review.md",
  "docs.md",
  // The dokumentator's durable project/domain learnings (Phase 4): the memory
  // recorder files this as a knowledge note on a successful delivery, and the
  // web artifact endpoint serves it like any other.
  "learned.md",
] as const

/** One whitelisted pipeline run artifact: its name and its text content. */
export const PipelineRunArtifactSchema = z.object({
  name: z.enum(PIPELINE_RUN_ARTIFACTS),
  content: z.string(),
})
export type PipelineRunArtifact = z.infer<typeof PipelineRunArtifactSchema>

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
    resumePipelineRun: {
      method: "POST",
      path: "/pipelines/runs/:pipelineRunId/resume",
      pathParams: z.object({ pipelineRunId: z.string() }),
      body: ResumePipelineRunSchema,
      // 409: the run is not retries-parked (approval-parked runs resume only via
      // the approvals path — one gate, not two).
      responses: { 200: PipelineRunSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Resume a retries-parked pipeline run with an operator note",
    },
    getStageRunLogs: {
      method: "GET",
      path: "/pipelines/runs/:pipelineRunId/stages/:phaseId/logs",
      pathParams: z.object({ pipelineRunId: z.string(), phaseId: z.string() }),
      query: z.object({ offset: z.coerce.number().int().nonnegative().optional() }),
      responses: { 200: RunLogChunkSchema, 404: ErrorSchema },
      summary: "Read a pipeline stage's log from a byte offset",
    },
    getPipelineRunArtifact: {
      method: "GET",
      path: "/pipelines/runs/:pipelineRunId/artifacts/:name",
      pathParams: z.object({ pipelineRunId: z.string(), name: z.string() }),
      // The PR-gate decision surface (3.3): the pr draft + diffstat, plus the
      // handoff set. `name` is matched against a fixed allowlist server-side — there
      // is no generic file browser; the allowlist IS the API. 404 when absent.
      responses: { 200: PipelineRunArtifactSchema, 404: ErrorSchema },
      summary: "Read a whitelisted pipeline run artifact (PR draft, diffstat, handoffs)",
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
