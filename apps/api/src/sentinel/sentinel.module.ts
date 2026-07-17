import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { SubsystemFindingsModule } from "../subsystems/subsystem-findings.module";
import { TasksModule } from "../tasks/tasks.module";
import { SentinelService } from "./sentinel.service";

/**
 * NS2 F5a — Sentinel's scheduled security watch. A leaf module (like
 * `GapsModule`): imported by `AutomationsModule` (the scheduler target) and
 * `BriefingModule` (the findings extras array) but imports neither back — no
 * cycle risk, same position as `gap-detect`/`self-knowledge`.
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    MemoryModule,
    TasksModule,
    SubsystemFindingsModule,
  ],
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
