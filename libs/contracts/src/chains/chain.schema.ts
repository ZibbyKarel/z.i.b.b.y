import { z } from "zod";
import { AgentIdSchema } from "../agents/agent.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * One step of a chain: which pipeline runs. Linear v1 — step N+1 implicitly
 * consumes step N's delivered artifact (the N2a registry record), so no explicit
 * binding field is needed yet; adding one later is additive.
 */
export const ChainStepSchema = z.object({
  pipeline: AgentIdSchema,
});
export type ChainStep = z.infer<typeof ChainStepSchema>;

/**
 * An operator-authored chain of pipelines (N2b): _"research topic X overnight,
 * then build an app from the result"_. Composition is the operator's to author
 * (north-star) — a chain is an explicit, durable entity on disk, never an
 * implicit event subscription. Execution is completion-driven: a step's pipeline
 * finishing hands its durable artifact to the next step as its input handoff
 * (`consumes`/`produces` lifted to the run boundary).
 */
export const ChainSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  desc: z.string().optional(),
  steps: z.array(ChainStepSchema).min(1),
  /** Free-form operator brief passed to step 0 as its initial input handoff. */
  instructions: z.string().optional(),
  /**
   * Optional attribution to a subsystem of the federation (Phase 81) — mirrors
   * `Pipeline.ownerSubsystem`. Absent is legitimate: not every chain has an owner.
   */
  ownerSubsystem: SubsystemIdSchema.optional(),
});
export type Chain = z.infer<typeof ChainSchema>;

export const CreateChainSchema = ChainSchema;
export type CreateChainInput = z.infer<typeof CreateChainSchema>;

/** A chain-run step's lifecycle (pending → running → done/failed). */
export const ChainRunStepStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type ChainRunStepStatus = z.infer<typeof ChainRunStepStatusSchema>;

export const ChainRunStepSchema = z.object({
  index: z.number().int().min(0),
  pipeline: z.string().min(1),
  /** The pipeline run executing this step (absent while pending). */
  runRef: z.string().min(1).optional(),
  /** The artifact record the step delivered (absent until done + delivered). */
  artifactId: z.string().min(1).optional(),
  status: ChainRunStepStatusSchema,
});
export type ChainRunStep = z.infer<typeof ChainRunStepSchema>;

export const ChainRunStatusSchema = z.enum(["running", "parked", "done", "failed"]);
export type ChainRunStatus = z.infer<typeof ChainRunStatusSchema>;

/**
 * One execution of a chain — persisted as plain JSON (files are the source of
 * truth), so a chain survives restart: boot reconciles each step from the
 * durable artifact registry and continues where the work actually stands.
 * A broken handoff (missing/unreadable artifact) PARKS the run with a reason —
 * a chain never crashes and never silently skips a step.
 */
export const ChainRunSchema = z.object({
  chainRunId: z.string().min(1),
  chainId: z.string().min(1),
  status: ChainRunStatusSchema,
  /** Index of the step currently executing, or null once terminal. */
  currentStep: z.number().int().min(0).nullable(),
  steps: z.array(ChainRunStepSchema).min(1),
  startedAt: z.string().datetime(),
  parkedReason: z.string().optional(),
  /**
   * Úkol, ze kterého byl řetězec dispatchnutý (Phase 05) — chybí pro přímý
   * `POST /chains/:id/run` mimo task flow. Slouží k zápisu outcome zpátky na
   * úkol, stejně jako `AgentRun`/`PipelineRun`/`GoalRun`.
   */
  taskId: z.string().optional(),
});
export type ChainRun = z.infer<typeof ChainRunSchema>;
