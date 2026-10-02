import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema, RunArtifactSchema } from "../common.schema";
import { WorkflowRunSchema } from "./workflow-run.schema";
import { CreateWorkflowSchema, UpdateWorkflowSchema, WorkflowSchema } from "./workflow.schema";

const c = initContract();

const WorkflowIdParam = z.object({ id: z.string().min(1) });

/** The names a run artifact may have — the allowlist the artifact endpoint enforces. */
export const WORKFLOW_RUN_ARTIFACTS = [
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
 * One workflow run artifact: its name and its text content. `name` is widened to
 * a plain string (rather than `z.enum(WORKFLOW_RUN_ARTIFACTS)`) because the
 * server-side allowlist a run artifact can match is no longer just the global
 * delivery-loop set — it also accepts a name matching the run's own delivered
 * `file` output (see `readArtifact` in `workflow-runner.service.ts`).
 */
export const WorkflowRunArtifactSchema = RunArtifactSchema;
export type WorkflowRunArtifact = z.infer<typeof WorkflowRunArtifactSchema>;

/** CRUD over workflow definitions (`.workflow.md` files). Mirrors `agentsContract`. */
export const workflowsContract = c.router(
  {
    createWorkflow: {
      method: "POST",
      path: "/workflows",
      body: CreateWorkflowSchema,
      responses: { 201: WorkflowSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create a new workflow",
    },
    listWorkflows: {
      method: "GET",
      path: "/workflows",
      responses: { 200: z.array(WorkflowSchema) },
      summary: "List all workflows",
    },
    getWorkflow: {
      method: "GET",
      path: "/workflows/:id",
      pathParams: WorkflowIdParam,
      responses: { 200: WorkflowSchema, 404: ErrorSchema },
      summary: "Get a single workflow by id",
    },
    updateWorkflow: {
      method: "PATCH",
      path: "/workflows/:id",
      pathParams: WorkflowIdParam,
      body: UpdateWorkflowSchema,
      responses: { 200: WorkflowSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Partially update an existing workflow",
    },
    deleteWorkflow: {
      method: "DELETE",
      path: "/workflows/:id",
      pathParams: WorkflowIdParam,
      responses: { 200: z.object({ id: z.string() }), 404: ErrorSchema },
      summary: "Delete a workflow",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type WorkflowsContract = typeof workflowsContract;

/**
 * Workflow catalog-liveness contract — the one runtime endpoint that survives the
 * run-surface unification: the "what's running now" list that feeds the catalog
 * attempt counters and live badges. Every other run operation (start, detail,
 * logs, resume, delete, artifacts) now lives on the unified `taskRuns` contract
 * under `/api/tasks/runs/*` — a workflow run is started only by creating a task.
 * The `WORKFLOW_RUN_ARTIFACTS` allowlist above is still the server-side guard the
 * unified artifact endpoint enforces.
 */
export const workflowRunsContract = c.router(
  {
    listWorkflowRuns: {
      method: "GET",
      path: "/workflows/runs",
      responses: { 200: z.array(WorkflowRunSchema) },
      summary: "List currently running (and just-finished) workflow runs",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type WorkflowRunsContract = typeof workflowRunsContract;
