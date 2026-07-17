import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ChannelsModule } from "../channels/channels.module";
import { GoalsModule } from "../goals/goals.module";
import { LimitsModule } from "../limits/limits.module";
import { MaestroModule } from "../maestro/maestro.module";
import { MemoryModule } from "../memory/memory.module";
import { MonitorsModule } from "../monitors/monitors.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { SelfKnowledgeModule } from "../self-knowledge/self-knowledge.module";
import { SentinelModule } from "../sentinel/sentinel.module";
import { SubsystemsModule } from "../subsystems/subsystems.module";
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
    MonitorsModule,
    ProjectsModule,
    ScheduledTasksStorageModule,
    // NS2 F3b — per-subsystem grouping lines (SubsystemsService) + the Ledger
    // note's weekly window % (LimitsService). Both one-directional: neither
    // subsystems nor limits imports briefing.
    SubsystemsModule,
    LimitsModule,
    // NS2 F4c — self-knowledge drift check (SelfKnowledgeService). One-directional:
    // self-knowledge doesn't import briefing.
    SelfKnowledgeModule,
    // NS2 F5a — Sentinel's findings extras array (SentinelService.readFindings).
    // A leaf module (like GapsModule) — one-directional, no cycle.
    SentinelModule,
    // NS2 F5b — Maestro's merge-queue summary lines (MaestroService.summaryLines).
    // A leaf module too — one-directional, no cycle.
    MaestroModule,
  ],
  controllers: [BriefingController],
  providers: [ClaudeCliBriefer, BriefingService],
  exports: [BriefingService],
})
export class BriefingModule {}
