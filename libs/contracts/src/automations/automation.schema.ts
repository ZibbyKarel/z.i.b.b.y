import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { AgentIdSchema } from "../agents/agent.schema";

/**
 * The closed catalog of named events an automation can listen for. A closed set (not
 * free text) so the operator picks from known signals instead of guessing a string —
 * the UI renders it as a multi-select. (No event bus auto-fires these yet; an event
 * automation fires via the manual trigger path. Extend this list as real emitters land.)
 */
export const AUTOMATION_EVENTS = [
  "file.created",
  "file.changed",
  "git.push",
  "pr.opened",
  "pr.merged",
  "run.completed",
  "run.failed",
  "email.received",
  "slack.message",
] as const;
export const AutomationEventSchema = z.enum(AUTOMATION_EVENTS);
export type AutomationEvent = z.infer<typeof AutomationEventSchema>;

/**
 * A cron trigger (5-field expr, evaluated in Europe/Prague) or one-or-more named
 * events — the automation fires when *any* listed event arrives.
 */
export const TriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cron"), expr: z.string().min(1) }),
  z.object({ type: z.literal("event"), events: z.array(AutomationEventSchema).min(1) }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

/**
 * What an automation runs when it fires. A skill can't be a target: it isn't an
 * autonomous executable — only agents and pipelines are real runners. The
 * `briefing` target (Phase 6.2) is deterministic assembly, not a claude run:
 * routing it through a runner would burn tokens to produce worse output, so the
 * scheduler dispatches it straight to the briefing service.
 */
export const TargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pipeline"), pipelineId: AgentIdSchema }),
  z.object({ type: z.literal("agent"), agentId: AgentIdSchema }),
  z.object({ type: z.literal("briefing") }),
  // Memory distillation: nightly sweep of terminal pipeline/agent/goal runs, a cheap
  // model (haiku) extracts durable learnings into the vault. Agents stay memory-blind;
  // learning is a SYSTEM capability — this is the canonical system automation. The
  // scheduler dispatches it straight to the memory-distiller service.
  z.object({ type: z.literal("memory-distill") }),
  // Pattern extraction (M4): scans 30 days of approval-decision activity, finds
  // repeated action+outcome pairs, and drafts rule proposals into the vault for the
  // morning briefing to surface. Deterministic; no LLM call.
  z.object({ type: z.literal("pattern-extract") }),
  // Gap detection (M5): scan recurring `task-created` activity for manual work that
  // could be automated, drafting "automate it?" suggestions into the vault for the
  // briefing. Deterministic; proposes ≠ acts (never creates an automation itself).
  z.object({ type: z.literal("gap-detect") }),
  // Agent Factory (Phase 4b): scan recurring `orchestrator-fallback` activity for a
  // missing specialist, draft a deterministic candidate agent `.md`, and park it
  // behind an `agent-proposal` approval. Deterministic; proposes ≠ activates (only
  // an approval flips a candidate to `status: active`).
  z.object({ type: z.literal("agent-factory") }),
]);
export type Target = z.infer<typeof TargetSchema>;

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
  /**
   * Free-text steering passed as input to whatever the automation runs — the agent's
   * prompt, the research focus ("what to research"), or the briefing voice ("how to
   * write the morning briefing"). Top-level (not per-target) so it always applies and
   * is always forwarded, whatever the target. Optional.
   */
  prompt: z.string().optional(),
  enabled: z.boolean(),
  /**
   * Server-owned: a system automation is seeded by ZIBBY and cannot be deleted; only
   * its schedule (`trigger`) and `enabled` state may be edited. It is never settable
   * through create/update (omitted from both input schemas) — the storage layer is
   * the sole authority.
   */
  system: z.boolean().default(false),
  /** ISO timestamp of the last fire, for idempotence + display. */
  lastFiredAt: IsoDateTimeSchema.optional(),
});
export type Automation = z.infer<typeof AutomationSchema>;

export const CreateAutomationSchema = AutomationSchema.omit({ lastFiredAt: true, system: true });
export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;

export const UpdateAutomationSchema = AutomationSchema.omit({
  id: true,
  lastFiredAt: true,
  system: true,
}).partial();
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>;
