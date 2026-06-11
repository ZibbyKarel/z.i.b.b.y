import { z } from "zod"
import { AgentIdSchema, AgentModelSchema, AgentThinkingSchema } from "../agents/agent.schema"

/**
 * A phase's optional back-edge (the "tester loop"). On failure the runner jumps
 * back to phase `to` with the failure context as its handoff input, up to
 * `maxRetries` times — the hard fuse against an infinite loop. After exhaustion it
 * `escalate`s (surfaces, never continues silently) and falls through to `then`
 * (another phase id, or the literal `"fail"`).
 */
export const PhaseLoopSchema = z.object({
  to: z.string().min(1),
  maxRetries: z.number().int().min(0),
  escalate: z.boolean(),
  then: z.string().min(1),
})
export type PhaseLoop = z.infer<typeof PhaseLoopSchema>

/**
 * What a phase executes. `agent` (the default, so every committed `.pipeline.md`
 * parses unchanged) spawns the phase agent; `verify` runs deterministic shell
 * checks (no model, no tokens, no intents) — the "tester" of the delivery loop.
 */
export const PipelinePhaseTypeSchema = z.enum(["agent", "verify"])
export type PipelinePhaseType = z.infer<typeof PipelinePhaseTypeSchema>

/**
 * Default verify-phase checks, shared by the API runner (fallback when neither
 * the phase nor the project declares its own) and the web display.
 */
export const DEFAULT_VERIFY_CHECKS = ["pnpm lint", "npx tsc --noEmit", "pnpm test"] as const

/**
 * One stage of a pipeline. Taken 1:1 from the dashboard's `PipelinePhase`, plus an
 * explicit `id`: loop targets reference phases by id (not array position or agent
 * name, since two phases may run the same agent). `consumes`/`produces` are
 * RELATIVE paths inside the stage's sandbox — the handoff files.
 *
 * Field requirements depend on `type` (enforced by the pipeline-level
 * superRefine): an `agent` phase requires `agent`/`model`/`thinking` and
 * `consumes`/`produces`; a `verify` phase forbids `agent` and may carry
 * `commands` (per-phase override of the project's checks).
 */
export const PipelinePhaseSchema = z.object({
  id: z.string().min(1),
  type: PipelinePhaseTypeSchema.default("agent"),
  agent: AgentIdSchema.optional(),
  consumes: z.string().min(1).optional(),
  produces: z.string().min(1).optional(),
  model: AgentModelSchema.optional(),
  thinking: AgentThinkingSchema.optional(),
  /** Verify phases only: shell commands run with `&&` (override project checks). */
  commands: z.array(z.string().min(1)).optional(),
  loop: PhaseLoopSchema.optional(),
})
export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>

/** The plain object form — `update` derives from this (a refined schema can't `.omit`). */
const PipelineObject = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  desc: z.string().optional(),
  phases: z.array(PipelinePhaseSchema).min(1),
  instructions: z.string().min(1),
})

/** Shared phase/loop validation (used by the full schema; storage re-validates updates). */
function refinePipeline(p: z.infer<typeof PipelineObject>, ctx: z.RefinementCtx): void {
  const ids = p.phases.map((ph) => ph.id)
  const idSet = new Set(ids)
  if (idSet.size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phase ids must be unique", path: ["phases"] })
  }
  p.phases.forEach((ph, i) => {
    if (ph.type === "agent") {
      for (const key of ["agent", "model", "thinking", "consumes", "produces"] as const) {
        if (ph[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `an agent phase requires "${key}"`,
            path: ["phases", i, key],
          })
        }
      }
    } else {
      // verify: deterministic checks — an agent makes no sense here.
      if (ph.agent !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a verify phase must not name an agent",
          path: ["phases", i, "agent"],
        })
      }
    }
    if (!ph.loop) return
    for (const [key, target] of [
      ["to", ph.loop.to],
      ["then", ph.loop.then],
    ] as const) {
      if (target !== "fail" && !idSet.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `loop.${key} "${target}" is not an existing phase id`,
          path: ["phases", i, "loop", key],
        })
      }
    }
  })
}

/**
 * A pipeline definition: an ordered chain of phases stored as a `.pipeline.md`
 * file (frontmatter carries `phases`, the Markdown body is `instructions`). The
 * `superRefine` rejects a dangling back-edge at the contract boundary — every
 * `loop.to`/`loop.then` must name an existing phase id (or `"fail"`), phase ids
 * must be unique, and per-`type` field requirements hold.
 */
export const PipelineSchema = PipelineObject.superRefine(refinePipeline)
export type Pipeline = z.infer<typeof PipelineSchema>

/** Body accepted by `createPipeline` — full entity, with loop targets validated. */
export const CreatePipelineSchema = PipelineSchema
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>

/** Body accepted by `updatePipeline` — every field optional (partial), id excluded. */
export const UpdatePipelineSchema = PipelineObject.omit({ id: true }).partial()
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>
