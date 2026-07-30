import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoutingProposalStore } from "./routing-proposal.store";

/**
 * NS2 F10 — resolves a parked Tier-3 ROUTING question: the `ResumableRunner` behind
 * the `routing-proposal` approval kind.
 *
 * A separate, deliberately thin service rather than methods on
 * {@link RoadmapGateService} for one blunt reason: the gate already has a public
 * `resume(projectId, itemId)` (resume a failed item's last run), which collides with
 * `ResumableRunner.resume(runId)`. Two unrelated meanings of "resume" on one class
 * would be a trap for the next reader, so the runner seam lives here and delegates.
 *
 * No module cycle: this depends on the gate, the gate depends only on the
 * proposal STORE (a plain file store with no service dependencies) plus
 * `ApprovalsService` — the edge never comes back.
 */
@Injectable()
export class RoutingProposalService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;

  constructor(
    private readonly proposals: RoutingProposalStore,
    private readonly gate: RoadmapGateService,
    private readonly approvals: ApprovalsService,
    logger: LoggerService,
  ) {
    this.log = logger.child(RoutingProposalService.name);
  }

  onModuleInit(): void {
    this.approvals.register("routing-proposal", this);
  }

  /**
   * Approve → release the parked item to the pick the operator just sanctioned, then
   * drop the proposal.
   *
   * The proposal is deleted only AFTER the release call returns: a failure leaves the
   * payload on disk so the same approval can be retried rather than losing the
   * question entirely (the same posture as `HandoffService.resume`). Never throws —
   * `ApprovalsService.approve` has already written the decision by the time this runs,
   * so throwing here would only strand that decision.
   */
  async resume(proposalId: string): Promise<void> {
    try {
      const proposal = await this.proposals.get(proposalId);
      await this.gate.releaseRouted(proposal.projectId, proposal.itemId, proposal.pick);
      await this.proposals.delete(proposalId).catch(() => {});
      this.log.info("routing proposal approved — item released", {
        proposalId,
        projectId: proposal.projectId,
        itemId: proposal.itemId,
      });
    } catch (error) {
      this.log.warn("routing proposal resume failed — proposal left for a retry", {
        proposalId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Reject → drop the proposal; the item stays with the operator (see `cancelRouting`). */
  cancel(proposalId: string): void {
    void this.gate.cancelRouting(proposalId).catch(() => {});
  }
}
