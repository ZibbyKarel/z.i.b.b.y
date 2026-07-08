import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ChainsModule } from "../chains/chains.module";
import { dataDir } from "../shared/data-dir";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { TasksModule } from "../tasks/tasks.module";
import { SUBSYSTEM_SEEN_FILE, SubsystemSeenStore } from "./subsystem-seen.store";
import { SubsystemsController } from "./subsystems.controller";
import { SubsystemsService } from "./subsystems.service";

/** Default seen-state file, anchored to the data root: `.zibby/data/subsystem-seen.json`. */
export function resolveSubsystemSeenFile(): string {
  return process.env.SUBSYSTEM_SEEN_FILE ?? dataDir("subsystem-seen.json");
}

/**
 * The subsystem-federation registry endpoint (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`). Phase 82
 * wires the real aggregation: pipelines/chains storage for `ownerSubsystem`
 * attribution, the unified task-runs feed (`TasksModule`) for run state, and
 * `ApprovalsModule` for pending Tier-3 items — read-only over all three, no
 * domain logic duplicated.
 */
@Module({
  imports: [PipelinesModule, ChainsModule, ApprovalsModule, TasksModule],
  controllers: [SubsystemsController],
  providers: [
    { provide: SUBSYSTEM_SEEN_FILE, useFactory: resolveSubsystemSeenFile },
    SubsystemSeenStore,
    SubsystemsService,
  ],
})
export class SubsystemsModule {}
