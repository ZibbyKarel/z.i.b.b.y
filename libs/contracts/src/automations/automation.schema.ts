import { z } from "zod"
import { AgentIdSchema } from "../agents/agent.schema"

/** A cron trigger (5-field expr, evaluated in Europe/Prague) or a named event. */
export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cron"), expr: z.string().min(1) }),
  z.object({ type: z.literal("event"), event: z.string().min(1) }),
])
export type Trigger = z.infer<typeof TriggerSchema>

/**
 * What an automation runs when it fires. A skill can't be a target: it isn't an
 * autonomous executable — only agents and pipelines are real runners. The
 * `briefing` target (Phase 6.2) is deterministic assembly, not a claude run:
 * routing it through a runner would burn tokens to produce worse output, so the
 * scheduler dispatches it straight to the briefing service.
 */
export const TargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pipeline"), pipelineId: AgentIdSchema }),
  z.object({ type: z.literal("agent"), agentId: AgentIdSchema, prompt: z.string().optional() }),
  z.object({ type: z.literal("briefing") }),
  // Phase 10.3: scan git/tests/vault for work and emit task CANDIDATES into the
  // approvals queue (a `proposed-task` per candidate). Deterministic assembly, not
  // a claude run — the scheduler dispatches it straight to the discovery service.
  z.object({ type: z.literal("discovery") }),
  // Memory distillation: nightly sweep of terminal pipeline/agent/goal runs, a cheap
  // model (haiku) extracts durable learnings into the vault. Agents stay memory-blind;
  // learning is a SYSTEM capability — this is the canonical system automation. The
  // scheduler dispatches it straight to the memory-distiller service.
  z.object({ type: z.literal("memory-distill") }),
])
export type Target = z.infer<typeof TargetSchema>

/**
 * A scheduled/triggered run. The daemon fires these without prompting — autonomy
 * of *planning*, not of destructive action: any external-effect action a triggered
 * run takes still queues through the approval gate (Phase 3/3.5).
 */
export const AutomationSchema = z.object({
  id: AgentIdSchema,
  name: z.string().min(1).optional(),
  trigger: TriggerSchema,
  target: TargetSchema,
  enabled: z.boolean(),
  /**
   * Server-owned: a system automation is seeded by ZIBBY and cannot be deleted; only
   * its schedule (`trigger`) may be edited. It is never settable through create/update
   * (omitted from both input schemas) — the storage layer is the sole authority.
   */
  system: z.boolean().default(false),
  /** ISO timestamp of the last fire, for idempotence + display. */
  lastFiredAt: z.string().datetime().optional(),
})
export type Automation = z.infer<typeof AutomationSchema>

export const CreateAutomationSchema = AutomationSchema.omit({ lastFiredAt: true, system: true })
export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>

export const UpdateAutomationSchema = AutomationSchema.omit({
  id: true,
  lastFiredAt: true,
  system: true,
}).partial()
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>
