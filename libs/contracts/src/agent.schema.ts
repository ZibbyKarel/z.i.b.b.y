import { z } from "zod"

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

/**
 * Full agent entity as returned by the API. On disk each agent is a Markdown file
 * named `<id>.md` with YAML frontmatter (`name`, `description`) and the
 * `instructions` as the Markdown body — the `id` is the file name and the name.
 */
export const AgentSchema = z.object({
  id: AgentIdSchema,
  description: z.string().optional(),
  instructions: z.string().min(1),
})
export type Agent = z.infer<typeof AgentSchema>

/** Body accepted by `createAgent`. */
export const CreateAgentSchema = z.object({
  id: AgentIdSchema,
  description: z.string().optional(),
  instructions: z.string().min(1),
})
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>

/** Body accepted by `updateAgent` — every field is optional (partial update). */
export const UpdateAgentSchema = z
  .object({
    description: z.string(),
    instructions: z.string().min(1),
  })
  .partial()
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>

/** Shared error body for 4xx responses. */
export const ErrorSchema = z.object({ message: z.string() })
export type ErrorBody = z.infer<typeof ErrorSchema>
