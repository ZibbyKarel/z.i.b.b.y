import { Module } from "@nestjs/common";
import { HandoffModule } from "../handoff/handoff.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { SubsystemFindingsModule } from "../subsystems/subsystem-findings.module";
import { SentinelService } from "./sentinel.service";

/**
 * NS2 F5a — Sentinel's scheduled security watch. A leaf module (like
 * `GapsModule`): imported by `AutomationsModule` (the scheduler target) and
 * `BriefingModule` (the findings extras array) but imports neither back — no
 * cycle risk, same position as `gap-detect`/`self-knowledge`.
 *
 * A3: `TasksModule` dropped — Sentinel no longer dispatches directly; every
 * finding routes through `HandoffModule`'s rule engine instead (which itself
 * carries the `TaskSchedulerService` dependency for the actual dispatch).
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    MemoryModule,
    HandoffModule,
    SubsystemFindingsModule,
  ],
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
