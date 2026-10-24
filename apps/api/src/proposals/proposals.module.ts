import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { ProposalsController } from "./proposals.controller";
import { ProposalsService } from "./proposals.service";
import { PROPOSALS_DIR, ProposalsStore } from "./proposals.store";

/** Default proposals dir (holds `proposals.json`), anchored to the data root. */
export function resolveProposalsDir(): string {
  return process.env.PROPOSALS_DIR ?? dataDir("proposals");
}

/**
 * System proposals (TODO 14): the store, the service producers upsert into, and
 * the review controller. Imports `ApprovalsModule` (a leaf — it imports no runner
 * module) so dismissing an agent-factory proposal rejects its approval through
 * `ApprovalsService.reject`. Imported by the producer modules (Patterns, Gaps,
 * AgentFactory); nothing here imports them back, so there is no cycle.
 * ActivityLogService/LoggerService come from their global modules.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [ProposalsController],
  providers: [
    { provide: PROPOSALS_DIR, useFactory: resolveProposalsDir },
    ProposalsStore,
    ProposalsService,
  ],
  exports: [ProposalsService],
})
export class ProposalsModule {}
