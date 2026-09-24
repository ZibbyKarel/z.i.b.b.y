import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ChannelsModule } from "../channels/channels.module";
import { GoalsModule } from "../goals/goals.module";
import { LimitsModule } from "../limits/limits.module";
import { ArchModule } from "../arch/arch.module";
import { ReleaseModule } from "../release/release.module";
import { MergeWatchModule } from "../release/merge-watch.module";
import { MemoryModule } from "../memory/memory.module";
import { MonitorsModule } from "../monitors/monitors.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { SelfKnowledgeModule } from "../self-knowledge/self-knowledge.module";
import { SecurityModule } from "../security/security.module";
import { DepartmentsModule } from "../departments/departments.module";
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
    // NS2 F3b — per-department grouping lines (DepartmentsService) + the Ledger
    // note's weekly window % (LimitsService). Both one-directional: neither
    // departments nor limits imports briefing.
    DepartmentsModule,
    LimitsModule,
    // NS2 F4c — self-knowledge drift check (SelfKnowledgeService). One-directional:
    // self-knowledge doesn't import briefing.
    SelfKnowledgeModule,
    // NS2 F5a — Security's findings extras array (SecurityService.readFindings).
    // A leaf module (like GapsModule) — one-directional, no cycle.
    SecurityModule,
    // NS2 F5b — Release's merge-queue summary lines (ReleaseService.summaryLines).
    // A leaf module too — one-directional, no cycle.
    ReleaseModule,
    // NS2 F5c — Arch's quality findings (ArchService.readFindings). Same leaf
    // position — one-directional, no cycle.
    ArchModule,
    // NS2 F7b-2 — the merge loop's recently-merged extras array (MergeWatchStore
    // read directly, no service needed). A leaf module — one-directional, no cycle.
    MergeWatchModule,
  ],
  controllers: [BriefingController],
  providers: [ClaudeCliBriefer, BriefingService],
  exports: [BriefingService],
})
export class BriefingModule {}
