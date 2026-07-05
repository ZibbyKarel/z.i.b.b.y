import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { GatesModule } from "../gates/gates.module";
import { AgentFactoryService } from "./agent-factory.service";
import { AgentProposalFlowService } from "./agent-proposal-flow.service";

/**
 * Agent Factory (Phase 4). Scans recurring `orchestrator-fallback` telemetry
 * (Phase 4a) for a missing specialist agent, drafts a deterministic candidate
 * `.md` (Phase 4b), and parks it behind the existing Tier-3 approval gate
 * (`AgentProposalFlowService`, the `ProposedTaskFlowService` template) —
 * approving flips the candidate to `status: "active"` (Phase 4c/4d). Imported
 * by AutomationsModule so the scheduler can dispatch the `agent-factory` system
 * automation; nothing here imports AutomationsModule, so there is no cycle.
 *
 * ActivityLogService/LoggerService come from their global modules — no
 * explicit import needed.
 */
@Module({
  imports: [AgentsModule, ApprovalsModule, GatesModule],
  providers: [AgentProposalFlowService, AgentFactoryService],
  exports: [AgentFactoryService],
})
export class AgentFactoryModule {}
