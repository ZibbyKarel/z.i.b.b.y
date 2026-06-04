import { z } from "zod"

/**
 * Shared error body for 4xx responses, used across multiple resource contracts
 * (agents, agent-runs, categories). Kept in a cross-domain `common` module rather
 * than any single resource's schema file so no domain has to reach into another's
 * just for the error shape.
 */
export const ErrorSchema = z.object({ message: z.string() })
export type ErrorBody = z.infer<typeof ErrorSchema>

/**
 * The shared lifecycle states a run can be in, across every run kind (agent,
 * skill, pipeline stage). `awaiting-approval` (Phase 3) is a *safe paused state
 * with no live child*: the runner created an approval and will not perform the
 * gated action until a decision arrives — so, unlike `running`, it survives a
 * restart unchanged rather than being reconciled to `interrupted`.
 */
export const RunStatusSchema = z.enum([
  "running",
  "done",
  "error",
  "interrupted",
  "awaiting-approval",
])
export type RunStatus = z.infer<typeof RunStatusSchema>

/**
 * Risk hint carried in agent/skill frontmatter. Display-only from Phase 3.5 on
 * (the gate policy engine decides; `risk` only colours the UI badge).
 */
export const RiskSchema = z.enum(["low", "medium", "high"])
export type Risk = z.infer<typeof RiskSchema>
