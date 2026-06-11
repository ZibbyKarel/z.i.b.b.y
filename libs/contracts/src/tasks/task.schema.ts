import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"

/**
 * Display fields every routing target carries. `glyph` is a free-form string
 * (the API doesn't know the design system's `IconName` union, exactly as
 * `AgentSchema.glyph` is a plain string); the web client narrows it to an
 * `IconName` on receipt.
 */
const taskTargetDisplayShape = {
  name: z.string().min(1),
  glyph: z.string().optional(),
  /** Free-form functional area, when the definition carries one. */
  category: z.string().optional(),
}

/** A stored agent as a routing destination. */
export const AgentTaskTargetSchema = z.object({
  kind: z.literal("agent"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
})

/** A stored pipeline as a routing destination. */
export const PipelineTaskTargetSchema = z.object({
  kind: z.literal("pipeline"),
  id: AgentIdSchema,
  ...taskTargetDisplayShape,
})

/**
 * The terminal routing fallback: a single orchestrator session that has every
 * stored agent available as a delegatable subagent and can also do the task
 * directly — so a task always executes. It is synthetic (no stored definition),
 * hence no `id`; `name`/`glyph` exist purely so the dashboard can render it.
 */
export const OrchestratorTaskTargetSchema = z.object({
  kind: z.literal("orchestrator"),
  ...taskTargetDisplayShape,
})

/**
 * A destination for a free-text task: a stored agent, a stored pipeline, or the
 * orchestrator fallback.
 */
export const TaskTargetSchema = z.discriminatedUnion("kind", [
  AgentTaskTargetSchema,
  PipelineTaskTargetSchema,
  OrchestratorTaskTargetSchema,
])
export type TaskTarget = z.infer<typeof TaskTargetSchema>
export type TaskTargetKind = TaskTarget["kind"]

/** A target that references a stored definition (has an `id`) — what the routers rank. */
export type CatalogTaskTarget = Extract<TaskTarget, { kind: "agent" | "pipeline" }>

/**
 * Reserved owner id orchestrator runs carry as their `agentId` in the run feed.
 * Not a stored agent — a stored definition with this id would shadow it.
 */
export const ORCHESTRATOR_ID = "orchestrator"

/** The orchestrator's synthetic display identity (the dashboard renders these). */
export const ORCHESTRATOR_TARGET = {
  kind: "orchestrator",
  name: "Orchestrator",
  glyph: "compass",
} as const satisfies TaskTarget

/**
 * Request body for the classifier: the free-text task plus any file/folder paths
 * the client already detected (strong routing hints — a `/media/…` path nudges
 * toward the media curator).
 */
export const ClassifyTaskInputSchema = z.object({
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).max(64).optional(),
})
export type ClassifyTaskInput = z.infer<typeof ClassifyTaskInputSchema>

/**
 * The router verdict the approval gate renders: the chosen target, a 0–1
 * confidence, a short human reason, the catalog terms that matched, and the full
 * candidate list so the user can override the destination.
 */
export const TaskRoutingSchema = z.object({
  target: TaskTargetSchema,
  /** 0–1; low values steer the user toward the manual picker. */
  confidence: z.number().min(0).max(1),
  /** One short human sentence explaining the choice. */
  reason: z.string(),
  /** Catalog terms that justified the match. */
  matchedTerms: z.array(z.string()),
  candidates: z.array(TaskTargetSchema).min(1),
})
export type TaskRouting = z.infer<typeof TaskRoutingSchema>

/**
 * The three delayed-start presets the New Task dialog offers. The wire format is
 * always the *resolved* absolute `scheduledAt` epoch ms (the client turns a preset
 * into a timestamp — `now` → null), so the backend never has to know preset
 * semantics; this enum is shared only so both ends name the choices the same way.
 */
export const SchedulePresetSchema = z.enum(["now", "in-1h", "limit-reset"])
export type SchedulePreset = z.infer<typeof SchedulePresetSchema>

/**
 * Lifecycle of a deferred task. It waits at `scheduled` until its `scheduledAt`,
 * when the scheduler classifies and dispatches it — to `dispatched` (carrying the
 * started run's `runRef`) or `failed` (carrying a short reason). A user may
 * `cancel` it while it is still waiting.
 */
export const ScheduledTaskStatusSchema = z.enum([
  "scheduled",
  "dispatched",
  "cancelled",
  "failed",
])
export type ScheduledTaskStatus = z.infer<typeof ScheduledTaskStatusSchema>

/**
 * A task whose dispatch was deferred to a future `scheduledAt`. Persisted as one
 * JSON file per id; the scheduler tick fires it when due (classify → start a run).
 */
export const ScheduledTaskSchema = z.object({
  id: z.string().min(1),
  /** Optional short human name; `""` when the user left it blank. */
  title: z.string().default(""),
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).default([]),
  /** Absolute epoch ms the task should fire at. */
  scheduledAt: z.number().int().positive(),
  status: ScheduledTaskStatusSchema,
  createdAt: z.string().datetime(),
  /** Set once dispatched: the classifier's chosen target. */
  target: TaskTargetSchema.optional(),
  /** Set once dispatched: the started agent-run / pipeline-run id. */
  runRef: z.string().optional(),
  /** Set on `failed`: a short reason. */
  error: z.string().optional(),
})
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>

/**
 * Request body for creating a task. `title` is an optional short name. A future
 * `scheduledAt` (absolute epoch ms) defers the task; a null/absent (or past) value
 * dispatches it immediately.
 */
export const CreateTaskInputSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).max(64).optional(),
  scheduledAt: z.number().int().positive().nullish(),
})
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

/**
 * Outcome of `createTask`: either the task was dispatched right away (→ a live run
 * the client can open) or parked for later (→ the persisted scheduled task).
 */
export const CreateTaskResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("dispatched"),
    runRef: z.string().min(1),
    target: TaskTargetSchema,
  }),
  z.object({
    outcome: z.literal("scheduled"),
    task: ScheduledTaskSchema,
  }),
])
export type CreateTaskResult = z.infer<typeof CreateTaskResultSchema>
