import { Injectable, Optional } from "@nestjs/common";
import type { Approval, ApprovalRunKind, SubsystemId } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ApprovalAlreadyDecidedError } from "./approvals.errors";
import { ApprovalsStorageService } from "./approvals.storage.service";

/**
 * The capability the approvals service needs from a runner to act on a decision,
 * without a compile-time dependency on the concrete runner (which would be a
 * cycle: runners depend on this service to *create* approvals). Runners register
 * themselves at startup.
 */
export interface ResumableRunner {
  /** Spawn an approved, previously-paused run. */
  resume(runId: string): Promise<void> | void;
  /** Terminate a rejected run without performing its action. */
  cancel(runId: string): void;
}

/** Inputs a runner supplies when it pauses a run on the approval gate. */
export interface RequestApprovalInput {
  runId: string;
  kind: ApprovalRunKind;
  skill: string;
  action: string;
  detail: string;
  risk: Approval["risk"];
  /**
   * NS2 F3c — the acting unit's owning subsystem. Only run-path callers supply
   * it (pipeline-runner from `pipeline.ownerSubsystem`, agent-runner from
   * `agent.ownerSubsystem`); every other call site omits it — an approval with
   * no acting unit never invents an owner.
   */
  ownerSubsystem?: SubsystemId;
  /**
   * Phase 127 — a link back to the gated item's origin (Jira/GitHub/Slack).
   * Only `ChannelTriageFlowService.parkForApproval` supplies it, copied from
   * the originating `ChannelItem.url`; every other call site omits it.
   */
  sourceUrl?: string;
}

/**
 * Orchestrates the approval gate (Phase 3): owns the durable approval store and a
 * runtime registry of runners keyed by kind. Runners call {@link requestApproval}
 * when they pause a run, and {@link register} themselves at startup so a decision
 * can be routed back to the right runner — `approve` resumes, `reject` cancels.
 */
@Injectable()
export class ApprovalsService {
  private readonly runners = new Map<ApprovalRunKind, ResumableRunner>();
  private readonly log?: ScopedLogger;

  constructor(
    private readonly storage: ApprovalsStorageService,
    // Optional so unit tests can `new ApprovalsService(storage)`; in the running
    // app the global LoggingModule always supplies it.
    @Optional() logger?: LoggerService,
    // Optional for the same reason; the global ActivityLogModule supplies it live.
    @Optional() private readonly activity?: ActivityLogService,
  ) {
    this.log = logger?.child(ApprovalsService.name);
  }

  /** A runner registers itself so decisions on its kind can be routed back to it. */
  register(kind: ApprovalRunKind, runner: ResumableRunner): void {
    this.runners.set(kind, runner);
    this.log?.debug("runner registered for approvals", { kind });
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
      ...(input.ownerSubsystem ? { ownerSubsystem: input.ownerSubsystem } : {}),
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    };
    this.log?.info("approval requested", {
      id: approval.id,
      runId: approval.runId,
      kind: approval.kind,
      action: approval.action,
      risk: approval.risk,
    });
    void this.activity?.record({
      kind: "approval-requested",
      summary: `approval needed: ${approval.skill} wants to ${approval.action}`,
      refs: {
        approvalId: approval.id,
        runRef: approval.runId,
        action: approval.action,
        status: approval.kind,
        // Best-effort subsystem attribution (F2c's `refs.ownerSubsystem`) so the
        // activity log's subsystem lens catches the request line too.
        ...(approval.ownerSubsystem ? { ownerSubsystem: approval.ownerSubsystem } : {}),
      },
    });
    return this.storage.create(approval);
  }

  list(status?: Approval["status"]): Promise<Approval[]> {
    return this.storage
      .list()
      .then((all) => (status ? all.filter((a) => a.status === status) : all));
  }

  get(id: string): Promise<Approval> {
    return this.storage.get(id);
  }

  /** Approve a pending approval and resume its gated run. */
  async approve(id: string): Promise<Approval> {
    const approval = await this.decide(id, "approved");
    this.log?.info("approval approved; resuming run", {
      id,
      runId: approval.runId,
      kind: approval.kind,
    });
    await this.runners.get(approval.kind)?.resume(approval.runId);
    return approval;
  }

  /** Reject a pending approval and terminate its gated run (no action taken). */
  async reject(id: string): Promise<Approval> {
    const approval = await this.decide(id, "rejected");
    this.log?.info("approval rejected; cancelling run", {
      id,
      runId: approval.runId,
      kind: approval.kind,
    });
    this.runners.get(approval.kind)?.cancel(approval.runId);
    return approval;
  }

  /**
   * Resolve any pending approval that belongs to `runId` as rejected, WITHOUT
   * routing the decision back to the runner. Called by a runner that is deleting
   * the run itself (the run is already being torn down), so the queue doesn't keep
   * a pending card for a run that no longer exists.
   */
  async cancelPendingForRun(runId: string): Promise<void> {
    const pending = await this.list("pending");
    for (const approval of pending.filter((a) => a.runId === runId)) {
      await this.decide(approval.id, "rejected").catch(() => {});
      this.log?.info("pending approval cancelled with its run", { id: approval.id, runId });
    }
  }

  /**
   * TOCTOU guard (Phase 8.2 pattern): a read-check-write on the shared approval
   * file races another concurrent `decide` on the same id (two operators, or a
   * double-click) — both could pass the `!== "pending"` check before either
   * writes, both persist a terminal status, and both routes to the runner
   * (`approve`/`reject` only call it AFTER `decide` returns). `withPathLock`
   * serializes calls per `id` (unrelated approvals stay fully concurrent); the
   * loser re-reads inside the lock after the winner's write and correctly throws
   * `ApprovalAlreadyDecidedError`, so it never reaches its runner call. Not
   * reentrant — this is the only call site, and it never re-enters the lock.
   */
  private decide(id: string, status: "approved" | "rejected"): Promise<Approval> {
    return withPathLock(`approval:${id}`, async () => {
      const approval = await this.storage.get(id);
      if (approval.status !== "pending") throw new ApprovalAlreadyDecidedError(id);
      const decided: Approval = { ...approval, status, decidedAt: new Date().toISOString() };
      void this.activity?.record({
        kind: status === "approved" ? "approval-approved" : "approval-rejected",
        summary: `approval ${status}: ${approval.skill} · ${approval.action}`,
        refs: { approvalId: id, runRef: approval.runId, decision: status, status: approval.kind },
      });
      return this.storage.update(decided);
    });
  }
}
