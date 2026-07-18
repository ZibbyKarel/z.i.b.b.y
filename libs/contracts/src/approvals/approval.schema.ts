import { z } from "zod";
import { IsoDateTimeSchema, RiskSchema } from "../common.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * Which run kind an approval gates — so a decision can be routed to the right
 * runner. `channel` (Phase 5.3) gates a drafted reply to an inbound channel item;
 * the runId is a compound `<integrationId>/<itemId>` ref. `task` (Phase 8.1) gates
 * a budget overage: a task held over a per-engagement cap, where the runId is the
 * task id and approving it dispatches the task once, past the cap.
 */
export const ApprovalRunKindSchema = z.enum([
  "agent",
  "pipeline-stage",
  "channel",
  "task",
  // Phase 10.3 (producer removed in NS2 F0a — discovery module deleted, scanner
  // retired Phase 116a). Kept for read-compat only: a pre-existing parked
  // `proposed-task` approval re-parses on read but is now unresolvable (no
  // handler dispatches it) — a logged no-op if one is ever approved/rejected.
  "proposed-task",
  // A pipeline-level `pr` output sink awaiting sign-off before it opens the PR.
  // The runId is the pipelineRunId itself (no live child — the chain already
  // finished); approving it runs the gated push, rejecting it leaves the branch
  // work without a PR. Structural "PR is the gate", system-owned, no agent.
  "pipeline-output",
  // The directed-task counterpart: a task whose chosen `pr` output is waiting to
  // open the PR from the finished agent/orchestrator run's branch. The runId is the
  // taskId (the durable ScheduledTask record holds the gate state — no live child);
  // approving runs the gated push, rejecting leaves the committed branch without a PR.
  "task-output",
  // The finished-day "creates a Jira task": an outbound Jira-issue create parked for
  // approval. The runId is the create-request id; approving it performs the gated POST
  // via the Jira adapter, rejecting it drops the request. Outbound write → always Tier-3.
  "jira-issue",
  // N5a "controlling the machine": a machine action (e.g. rename files in a named
  // folder) parked with its dry-run preview. The runId is the MachineActionRecord id;
  // approving executes the preview exactly once, rejecting leaves the disk untouched.
  "machine",
  // Phase 4d (Agent Factory): a deterministically-generated candidate agent (from
  // recurring orchestrator fallbacks) awaiting sign-off before it becomes
  // dispatchable. The runId is the candidate agent's id; approving flips its
  // `status` to `active` (visible immediately — read-through storage), rejecting
  // deletes the candidate file (the approval record remains as the trace).
  "agent-proposal",
  // NS2 F6a — Herald's evidence-based autonomy graduation: a (channel, category)
  // that accumulated N consecutive operator-approved (unedited) replies is proposed
  // for Tier-2 auto-send. The runId is `<integrationId>/<category>`; approving writes
  // the graduation (future replies of that category on that channel auto-send through
  // the same gate), rejecting leaves the channel at Tier-3. The graduation decision
  // is itself Tier-3 — autonomy widens only on an operator's explicit sign-off.
  "herald-graduation",
]);
export type ApprovalRunKind = z.infer<typeof ApprovalRunKindSchema>;

/** Lifecycle of an approval: created `pending`, then a human decides. */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * A request for human sign-off before a gated action runs. Unifies the dashboard's
 * `Approval` (`id, skill, action, detail, risk`) with the link to the paused run
 * (`runId`, `kind`) and the decision lifecycle. Persisted durably so it survives
 * polling and a backend restart. Phase 3.5 generalises this into the gate engine's
 * richer `PendingApproval` (with `steps[]`); this stays the single-human-step case.
 */
export const ApprovalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  kind: ApprovalRunKindSchema,
  /** The acting agent/skill name (the dashboard's `skill` field). */
  skill: z.string(),
  /** What it wants to do (e.g. "run", "git.push", "purchase"). */
  action: z.string(),
  /** Human-readable detail (e.g. the prompt). */
  detail: z.string(),
  risk: RiskSchema,
  status: ApprovalStatusSchema,
  requestedAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.optional(),
  /**
   * NS2 F3c — the owning subsystem of the ACTING unit that raised this approval
   * (the pipeline's / agent's `ownerSubsystem`), stamped at request time by the
   * run-path callers only. Optional and additive: system-owned gates with no
   * acting unit (machine, jira-issue, channel, budget-task, agent-proposal)
   * never invent an owner, and every pre-existing approval re-parses untouched.
   * Powers the queue's per-subsystem filter — read-only attribution, never
   * routing (decisions still route by `kind`).
   */
  ownerSubsystem: SubsystemIdSchema.optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;
