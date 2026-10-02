import { Module } from "@nestjs/common";
import { SignalBusModule } from "../automations/signal-bus.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { DepartmentFindingsModule } from "../departments/department-findings.module";
import { SecurityService } from "./security.service";

/**
 * NS2 F5a — Security's scheduled security watch. A leaf module (like
 * `GapsModule`): imported by `AutomationsModule` (the scheduler target) and
 * `BriefingModule` (the findings extras array) but imports neither back — no
 * cycle risk, same position as `gap-detect`/`self-knowledge`.
 *
 * A3: `TasksModule` dropped — Security no longer dispatches directly; every
 * finding routes through the signal bus instead (the scheduler dispatches the matching automations).
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    MemoryModule,
    SignalBusModule,
    DepartmentFindingsModule,
  ],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
