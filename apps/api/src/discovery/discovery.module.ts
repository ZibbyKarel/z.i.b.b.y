import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { TasksModule } from "../tasks/tasks.module";
import { dataDir } from "../shared/data-dir";
import { DiscoveryController } from "./discovery.controller";
import { ProposedTaskFlowService } from "./proposed-task-flow.service";
import { PROPOSALS_DIR, ProposalsStorageService } from "./proposals.storage.service";

/** Default proposals dir, anchored to `apps/api/data/proposals`. */
export function resolveProposalsDir(): string {
  return process.env.PROPOSALS_DIR ?? dataDir("proposals");
}

/**
 * Discovery proposals (Phase 10.3). Parks each candidate behind a `proposed-task`
 * approval (ProposedTaskFlowService, the ResumableRunner) and dispatches an approved
 * one via the task scheduler. The triage scan that produced candidates is gone
 * (Phase 116a — the operator now targets pipelines like `code-audit` directly); this
 * module keeps the proposals-inbox feature: storage, the dispatch flow, and the
 * read-only controller. Imports MemoryModule (the vault read surface, still used by
 * the flow), Projects, Approvals (the gate) and Tasks (createTask on approval).
 */
@Module({
  imports: [MemoryModule, ProjectsModule, ApprovalsModule, TasksModule],
  controllers: [DiscoveryController],
  providers: [
    { provide: PROPOSALS_DIR, useFactory: resolveProposalsDir },
    ProposalsStorageService,
    ProposedTaskFlowService,
  ],
  exports: [ProposalsStorageService],
})
export class DiscoveryModule {}
