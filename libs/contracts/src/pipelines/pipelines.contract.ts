import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema, RunArtifactSchema } from "../common.schema";
import { PipelineRunSchema } from "./pipeline-run.schema";
import { CreatePipelineSchema, PipelineSchema, UpdatePipelineSchema } from "./pipeline.schema";

const c = initContract();

const PipelineIdParam = z.object({ id: z.string().min(1) });

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
] as const;

/**
 * One pipeline run artifact: its name and its text content. `name` is widened to
 * a plain string (rather than `z.enum(PIPELINE_RUN_ARTIFACTS)`) because the
 * server-side allowlist a run artifact can match is no longer just the global
 * delivery-loop set — it also accepts a name matching the run's own delivered
 * `file` output (see `readArtifact` in `pipeline-runner.service.ts`).
 */
export const PipelineRunArtifactSchema = RunArtifactSchema;
export type PipelineRunArtifact = z.infer<typeof PipelineRunArtifactSchema>;

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
);
export type PipelinesContract = typeof pipelinesContract;

/**
 * Pipeline catalog-liveness contract — the one runtime endpoint that survives the
 * run-surface unification: the "what's running now" list that feeds the catalog
 * attempt counters and live badges. Every other run operation (start, detail,
 * logs, resume, delete, artifacts) now lives on the unified `taskRuns` contract
 * under `/api/tasks/runs/*` — a pipeline run is started only by creating a task.
 * The `PIPELINE_RUN_ARTIFACTS` allowlist above is still the server-side guard the
 * unified artifact endpoint enforces.
 */
export const pipelineRunsContract = c.router(
  {
    listPipelineRuns: {
      method: "GET",
      path: "/pipelines/runs",
      responses: { 200: z.array(PipelineRunSchema) },
      summary: "List currently running (and just-finished) pipeline runs",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type PipelineRunsContract = typeof pipelineRunsContract;
