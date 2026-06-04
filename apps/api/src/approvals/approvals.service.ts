import { Injectable } from "@nestjs/common"
import type { Approval, ApprovalRunKind } from "@zibby/contracts"
import { ApprovalAlreadyDecidedError } from "./approvals.errors"
import { ApprovalsStorageService } from "./approvals.storage.service"

/**
 * The capability the approvals service needs from a runner to act on a decision,
 * without a compile-time dependency on the concrete runner (which would be a
 * cycle: runners depend on this service to *create* approvals). Runners register
 * themselves at startup.
 */
export interface ResumableRunner {
  /** Spawn an approved, previously-paused run. */
  resume(runId: string): Promise<void> | void
  /** Terminate a rejected run without performing its action. */
  cancel(runId: string): void
}

/** Inputs a runner supplies when it pauses a run on the approval gate. */
export interface RequestApprovalInput {
  runId: string
  kind: ApprovalRunKind
  skill: string
  action: string
  detail: string
  risk: Approval["risk"]
}

/**
 * Orchestrates the approval gate (Phase 3): owns the durable approval store and a
 * runtime registry of runners keyed by kind. Runners call {@link requestApproval}
 * when they pause a run, and {@link register} themselves at startup so a decision
 * can be routed back to the right runner — `approve` resumes, `reject` cancels.
 */
@Injectable()
export class ApprovalsService {
  private readonly runners = new Map<ApprovalRunKind, ResumableRunner>()

  constructor(private readonly storage: ApprovalsStorageService) {}

  /** A runner registers itself so decisions on its kind can be routed back to it. */
  register(kind: ApprovalRunKind, runner: ResumableRunner): void {
    this.runners.set(kind, runner)
  }

  /** Create a pending approval for a paused run. */
  requestApproval(input: RequestApprovalInput): Promise<Approval> {
    const approval: Approval = {
      id: this.storage.newId(input.kind),
      runId: input.runId,
      kind: input.kind,
      skill: input.skill,
      action: input.action,
      detail: input.detail,
      risk: input.risk,
      status: "pending",
      requestedAt: new Date().toISOString(),
    }
    return this.storage.create(approval)
  }

  list(status?: Approval["status"]): Promise<Approval[]> {
    return this.storage.list().then((all) => (status ? all.filter((a) => a.status === status) : all))
  }

  get(id: string): Promise<Approval> {
    return this.storage.get(id)
  }

  /** Approve a pending approval and resume its gated run. */
  async approve(id: string): Promise<Approval> {
    const approval = await this.decide(id, "approved")
    await this.runners.get(approval.kind)?.resume(approval.runId)
    return approval
  }

  /** Reject a pending approval and terminate its gated run (no action taken). */
  async reject(id: string): Promise<Approval> {
    const approval = await this.decide(id, "rejected")
    this.runners.get(approval.kind)?.cancel(approval.runId)
    return approval
  }

  private async decide(id: string, status: "approved" | "rejected"): Promise<Approval> {
    const approval = await this.storage.get(id)
    if (approval.status !== "pending") throw new ApprovalAlreadyDecidedError(id)
    const decided: Approval = { ...approval, status, decidedAt: new Date().toISOString() }
    return this.storage.update(decided)
  }
}
