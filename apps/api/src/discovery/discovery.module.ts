import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { TasksModule } from "../tasks/tasks.module";
import { dataDir } from "../shared/data-dir";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryTriageService } from "./discovery-triage.service";
import { ProposedTaskFlowService } from "./proposed-task-flow.service";
import { PROPOSALS_DIR, ProposalsStorageService } from "./proposals.storage.service";

/** Default proposals dir, anchored to `apps/api/data/proposals`. */
export function resolveProposalsDir(): string {
  return process.env.PROPOSALS_DIR ?? dataDir("proposals");
}

/**
 * Discovery triage (Phase 10.3). Scans projects/vault for work (DiscoveryTriageService),
 * parks each candidate behind a `proposed-task` approval (ProposedTaskFlowService,
 * the ResumableRunner) and dispatches an approved one via the task scheduler. Imports
 * MemoryModule (the vault read surface), Projects, Approvals (the gate) and Tasks
 * (createTask on approval). Exports the triage service so the scheduler's `discovery`
 * automation target can dispatch it.
 */
@Module({
  imports: [MemoryModule, ProjectsModule, ApprovalsModule, TasksModule],
  controllers: [DiscoveryController],
  providers: [
    { provide: PROPOSALS_DIR, useFactory: resolveProposalsDir },
    ProposalsStorageService,
    ProposedTaskFlowService,
    DiscoveryTriageService,
  ],
  exports: [DiscoveryTriageService, ProposalsStorageService],
})
export class DiscoveryModule {}
