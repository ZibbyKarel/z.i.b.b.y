import { z } from "zod"

/**
 * Allowed shape of an agent `id`. The id doubles as the on-disk file name, so it
 * is deliberately restrictive: lowercase/uppercase alphanumerics plus `.`, `_`
 * and `-`, never starting or ending with a separator. This rules out path
 * separators (`/`, `\`) and traversal sequences (`..`) at the contract boundary.
 * The storage layer enforces the same rule independently (defense in depth).
 */
export const AGENT_ID_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/

export const AgentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'")

/** Full agent entity as persisted and returned by the API. */
export const AgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Agent = z.infer<typeof AgentSchema>

/** Body accepted by `createAgent`. */
export const CreateAgentSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
})
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>

/** Body accepted by `updateAgent` — every field is optional (partial update). */
export const UpdateAgentSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    instructions: z.string().min(1),
  })
  .partial()
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>

/** Shared error body for 4xx responses. */
export const ErrorSchema = z.object({ message: z.string() })
export type ErrorBody = z.infer<typeof ErrorSchema>
