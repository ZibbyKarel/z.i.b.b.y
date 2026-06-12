import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AgentsModule } from "./agents/agents.module"
import { ApprovalsModule } from "./approvals/approvals.module"
import { AutomationsModule } from "./automations/automations.module"
import { EventsModule } from "./events/events.module"
import { GateRulesModule } from "./gate-rules/gate-rules.module"
import { HealthModule } from "./health/health.module"
import { IntegrationsModule } from "./integrations/integrations.module"
import { LimitsModule } from "./limits/limits.module"
import { MemoryModule } from "./memory/memory.module"
import { RunRecorderModule } from "./memory/run-recorder.module"
import { PipelinesModule } from "./pipelines/pipelines.module"
import { ProjectsModule } from "./projects/projects.module"
import { LoggingModule } from "./shared/logging/logging.module"
import { SkillsModule } from "./skills/skills.module"
import { TasksModule } from "./tasks/tasks.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    AgentsModule,
    SkillsModule,
    ProjectsModule,
    PipelinesModule,
    ApprovalsModule,
    GateRulesModule,
    MemoryModule,
    RunRecorderModule,
    AutomationsModule,
    IntegrationsModule,
    HealthModule,
    LimitsModule,
    EventsModule,
    TasksModule,
  ],
})
export class AppModule {}
