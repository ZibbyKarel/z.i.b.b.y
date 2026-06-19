import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ChannelsModule } from "../channels/channels.module";
import { GoalsModule } from "../goals/goals.module";
import { MemoryModule } from "../memory/memory.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { ScheduledTasksStorageModule } from "../tasks/scheduled-tasks-storage.module";
import { BriefingController } from "./briefing.controller";
import { BriefingService } from "./briefing.service";
import { ClaudeCliBriefer } from "./claude-cli-briefer";

/**
 * The briefing (Phase 6.2). Sits ABOVE the stores it reads — Approvals (pending
 * decisions), Pipelines (parked runs), Channels (the item store, which that module
 * exports) and Memory (vault persistence); the activity log is global. It must
 * NEVER import AutomationsModule — AutomationsModule imports THIS for the briefing
 * target, so the reverse edge would be a cycle.
 */
@Module({
  imports: [
    ApprovalsModule,
    PipelinesModule,
    GoalsModule,
    ChannelsModule,
    MemoryModule,
    ProjectsModule,
    ScheduledTasksStorageModule,
  ],
  controllers: [BriefingController],
  providers: [ClaudeCliBriefer, BriefingService],
  exports: [BriefingService],
})
export class BriefingModule {}
