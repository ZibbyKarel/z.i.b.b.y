import { z } from "zod"

/**
 * Shared error body for 4xx responses, used across multiple resource contracts
 * (agents, agent-runs, categories). Kept in a cross-domain `common` module rather
 * than any single resource's schema file so no domain has to reach into another's
 * just for the error shape.
 */
export const ErrorSchema = z.object({ message: z.string() })
export type ErrorBody = z.infer<typeof ErrorSchema>
