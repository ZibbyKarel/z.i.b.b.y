import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ActivityLogModule } from "./activity/activity-log.module"
import { ActivityRecorderModule } from "./activity/activity-recorder.module"
import { AgentsModule } from "./agents/agents.module"
import { ApprovalsModule } from "./approvals/approvals.module"
import { AutomationsModule } from "./automations/automations.module"
import { BriefingModule } from "./briefing/briefing.module"
import { BudgetModule } from "./budget/budget.module"
import { ChannelsModule } from "./channels/channels.module"
import { CommandsModule } from "./commands/commands.module"
import { DiscoveryModule } from "./discovery/discovery.module"
import { EventsModule } from "./events/events.module"
import { GateRulesModule } from "./gate-rules/gate-rules.module"
import { GoalsModule } from "./goals/goals.module"
import { HealthModule } from "./health/health.module"
import { HooksModule } from "./hooks/hooks.module"
import { IntegrationsModule } from "./integrations/integrations.module"
import { LimitResumeModule } from "./limits-resume/limit-resume.module"
import { LimitsModule } from "./limits/limits.module"
import { MandateModule } from "./mandate/mandate.module"
import { McpModule } from "./mcp/mcp.module"
import { MemoryModule } from "./memory/memory.module"
import { RunRecorderModule } from "./memory/run-recorder.module"
import { PipelinesModule } from "./pipelines/pipelines.module"
import { ProjectsModule } from "./projects/projects.module"
import { ResearchModule } from "./research/research.module"
import { LoggingModule } from "./shared/logging/logging.module"
import { SkillsModule } from "./skills/skills.module"
import { TasksModule } from "./tasks/tasks.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    ActivityLogModule,
    AgentsModule,
    SkillsModule,
    ProjectsModule,
    PipelinesModule,
    GoalsModule,
    ApprovalsModule,
    GateRulesModule,
    MemoryModule,
    RunRecorderModule,
    ActivityRecorderModule,
    BriefingModule,
    AutomationsModule,
    IntegrationsModule,
    HooksModule,
    McpModule,
    CommandsModule,
    MandateModule,
    ChannelsModule,
    DiscoveryModule,
    ResearchModule,
    HealthModule,
    LimitsModule,
    LimitResumeModule,
    EventsModule,
    BudgetModule,
    TasksModule,
  ],
})
export class AppModule {}
