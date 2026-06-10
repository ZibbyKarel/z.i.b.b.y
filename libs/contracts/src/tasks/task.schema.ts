import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"

/**
 * A candidate destination for a free-text task — one stored agent or one stored
 * pipeline. `glyph` is a free-form string (the API doesn't know the design
 * system's `IconName` union, exactly as `AgentSchema.glyph` is a plain string);
 * the web client narrows it to an `IconName` on receipt.
 */
export const TaskTargetSchema = z.object({
  kind: z.enum(["agent", "pipeline"]),
  id: AgentIdSchema,
  name: z.string().min(1),
  glyph: z.string().optional(),
  /** Free-form functional area, when the definition carries one. */
  category: z.string().optional(),
})
export type TaskTarget = z.infer<typeof TaskTargetSchema>
export type TaskTargetKind = TaskTarget["kind"]

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
