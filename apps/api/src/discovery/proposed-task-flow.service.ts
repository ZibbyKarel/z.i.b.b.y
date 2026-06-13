import { Injectable, type OnModuleInit } from "@nestjs/common"
import type { Proposal, SuggestedTarget, TaskTarget } from "@zibby/contracts"
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TaskSchedulerService } from "../tasks/task-scheduler.service"
import { ProposalsStorageService } from "./proposals.storage.service"

/**
 * Convert a discovery {@link SuggestedTarget} into a dispatchable {@link TaskTarget},
 * or `undefined` to fall back to classification. `orchestrator` needs no id; a
 * stored-definition kind without an id can't be dispatched, so it degrades to
 * classification rather than a malformed target.
 */
function toTaskTarget(s: SuggestedTarget | undefined): TaskTarget | undefined {
  if (!s) return undefined
  if (s.kind === "orchestrator") return { kind: "orchestrator", name: "Orchestrator", glyph: "compass" }
  if (!s.id) return undefined
  return { kind: s.kind, id: s.id, name: s.id }
}

/**
 * The `proposed-task` approval runner (Phase 10.3) — the one-for-one copy of the
 * channel-triage flow. A discovery candidate is PARKED behind a `proposed-task`
 * approval (the gate is the inbox); approving it dispatches the task through the
 * existing {@link TaskSchedulerService.createTask} path (budget/concurrency/outcome
 * for free), rejecting it marks the proposal ignored. **Proposed ≠ dispatched:**
 * this flow only parks/dispatches via the gate — discovery never calls `createTask`.
 */
@Injectable()
export class ProposedTaskFlowService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly proposals: ProposalsStorageService,
    private readonly tasks: TaskSchedulerService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ProposedTaskFlowService.name)
  }

  onModuleInit(): void {
    // Register so a decision on a proposed-task approval routes back here.
    this.approvals.register("proposed-task", this)
  }

  /** Park a proposal behind a Tier-3 `proposed-task` approval; persists the approval id. */
  async park(proposal: Proposal): Promise<void> {
    const approval = await this.approvals.requestApproval({
      runId: proposal.id,
      kind: "proposed-task",
      skill: "discovery",
      action: "dispatch-task",
      detail: `${proposal.candidate.title} — ${proposal.candidate.rationale}`,
      risk: "low",
    })
    await this.proposals.update({ ...proposal, approvalId: approval.id })
    this.log.info("proposed task parked for approval", {
      proposalId: proposal.id,
      approvalId: approval.id,
    })
  }

  /** Approve → dispatch the proposed task once, through the normal createTask path. */
  async resume(proposalId: string): Promise<void> {
    const proposal = await this.proposals.get(proposalId).catch(() => null)
    if (!proposal || proposal.state !== "proposed") {
      this.log.warn("proposed-task resume skipped", { proposalId, state: proposal?.state })
      return
    }
    const target = toTaskTarget(proposal.candidate.suggestedTarget)
    await this.tasks.createTask(
      { text: proposal.candidate.text, title: proposal.candidate.title },
      Date.now(),
      undefined,
      target,
    )
    await this.proposals.update({ ...proposal, state: "dispatched" })
    this.log.info("proposed task dispatched on approval", { proposalId, target: target?.kind })
  }

  /** Reject → mark the proposal ignored (no task is created). */
  cancel(proposalId: string): void {
    void this.proposals
      .get(proposalId)
      .then((p) => (p.state === "proposed" ? this.proposals.update({ ...p, state: "ignored" }) : null))
      .catch(() => {})
  }
}
