import { z } from "zod"
import { RiskSchema } from "../common.schema"
import { GateRuleInputSchema } from "../gates/gate.schema"

/**
 * Allowed shape of an agent `id`. The id doubles as the on-disk file name (and is
 * the agent's name), so it is deliberately restrictive: letters, numbers, `.`,
 * `_` and `-`, never starting or ending with a separator. This rules out path
 * separators (`/`, `\`) and traversal sequences (`..`) at the contract boundary.
 * The storage layer enforces the same rule independently (defense in depth).
 */
export const AGENT_ID_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/

export const AgentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'")

/** Model the agent runs on. Mirrors the dashboard's `ModelName`. */
export const AgentModelSchema = z.enum(["opus", "sonnet", "haiku"])
export type AgentModel = z.infer<typeof AgentModelSchema>

/** Thinking budget. Mirrors the dashboard's `ThinkingLevel`. */
export const AgentThinkingSchema = z.enum(["high", "medium", "low"])
export type AgentThinking = z.infer<typeof AgentThinkingSchema>

/**
 * Full agent entity as returned by the API. On disk each agent is a Markdown file
 * named `<id>.md` with YAML frontmatter and the `instructions` as the Markdown
 * body — the `id` is the file name. The frontmatter carries the structured config
 * the dashboard edits (`name`, `description`, `glyph`, `model`, `thinking`,
 * `tools`, `category`); only `id` + `instructions` are required.
 * `category` and `glyph` stay free-form strings on purpose — the closed set lives
 * in the web app, and the API shouldn't 400 on a new value it hasn't shipped yet.
 */
export const AgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  glyph: z.string().optional(),
  model: AgentModelSchema.optional(),
  thinking: AgentThinkingSchema.optional(),
  tools: z.array(z.string()).optional(),
  category: z.string().optional(),
  /**
   * Phase 3 approval gate. When true the runner pauses before spawning and waits
   * for a decision (Variant A, gate at the run boundary). `risk` is a display hint.
   * Phase 3.5 generalises both into the `gates` policy engine, keeping these as
   * legacy sugar (`requires_approval` desugars to a catch-all `ask:human` rule).
   */
  requires_approval: z.boolean().optional(),
  risk: RiskSchema.optional(),
  /**
   * Phase 3.5 gate policy. An agent's own rules (harden-only over the system
   * floor). `requires_approval` is legacy sugar that desugars to a catch-all
   * `ask:human` rule when `gates` is absent.
   */
  gates: z.array(GateRuleInputSchema).optional(),
  /**
   * Ids of global rules (the "Pravidla schvalování" catalog) linked to this agent.
   * The shared middle policy layer: edited once on the catalog page, applied
   * everywhere it is linked. Distinct from `gates`, which are this agent's own rules.
   */
  gateRuleIds: z.array(z.string()).optional(),
  instructions: z.string().min(1),
})
export type Agent = z.infer<typeof AgentSchema>

/** Body accepted by `createAgent` — the full entity (`id` + `instructions` required). */
export const CreateAgentSchema = AgentSchema
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>

/** Body accepted by `updateAgent` — every field is optional (partial update), id excluded. */
export const UpdateAgentSchema = AgentSchema.omit({ id: true }).partial()
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>
