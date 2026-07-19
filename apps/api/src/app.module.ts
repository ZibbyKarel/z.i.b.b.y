import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ActivityLogModule } from "./activity/activity-log.module";
import { ActivityRecorderModule } from "./activity/activity-recorder.module";
import { ActivityViewModule } from "./activity-view/activity-view.module";
import { AgentsModule } from "./agents/agents.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { ArtifactsModule } from "./artifacts/artifacts.module";
import { AutomationsModule } from "./automations/automations.module";
import { BriefingModule } from "./briefing/briefing.module";
import { BriefingTranscriptSinkModule } from "./briefing/briefing-transcript-sink.module";
import { BudgetModule } from "./budget/budget.module";
import { ChainsModule } from "./chains/chains.module";
import { ChatModule } from "./chat/chat.module";
import { ChannelsModule } from "./channels/channels.module";
import { CommandsModule } from "./commands/commands.module";
import { CompaniesModule } from "./companies/companies.module";
import { EventsModule } from "./events/events.module";
import { GateRulesModule } from "./gate-rules/gate-rules.module";
import { GoalsModule } from "./goals/goals.module";
import { HealthModule } from "./health/health.module";
import { WatcherHealthModule } from "./health/watcher-health.module";
import { HooksModule } from "./hooks/hooks.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LimitResumeModule } from "./limits-resume/limit-resume.module";
import { LimitsModule } from "./limits/limits.module";
import { MaestroModule } from "./maestro/maestro.module";
import { MandateModule } from "./mandate/mandate.module";
import { McpModule } from "./mcp/mcp.module";
import { MemoryModule } from "./memory/memory.module";
import { RunRecorderModule } from "./memory/run-recorder.module";
import { MachineModule } from "./machine/machine.module";
import { MonitorsModule } from "./monitors/monitors.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { ProjectsModule } from "./projects/projects.module";
import { LoggingModule } from "./shared/logging/logging.module";
import { PinsModule } from "./pins/pins.module";
import { SelfModule } from "./self/self.module";
import { SelfKnowledgeModule } from "./self-knowledge/self-knowledge.module";
import { SkillsModule } from "./skills/skills.module";
import { SpeechModule } from "./speech/speech.module";
import { SubsystemsModule } from "./subsystems/subsystems.module";
import { SystemModule } from "./system/system.module";
import { AttachmentSetRefsModule } from "./tasks/attachment-set-refs.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    // F6c: @Global — every TickingWatcherBase watcher self-registers its heartbeat
    // probe here; listed early (like LoggingModule) so it exists before any watcher.
    WatcherHealthModule,
    SystemModule,
    PinsModule,
    ActivityLogModule,
    ActivityViewModule,
    AgentsModule,
    SkillsModule,
    ProjectsModule,
    CompaniesModule,
    PipelinesModule,
    GoalsModule,
    ApprovalsModule,
    ArtifactsModule,
    ChainsModule,
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
    MachineModule,
    MonitorsModule,
    MaestroModule,
    HealthModule,
    SubsystemsModule,
    SelfModule,
    SelfKnowledgeModule,
    LimitsModule,
    LimitResumeModule,
    EventsModule,
    BudgetModule,
    ChatModule,
    SpeechModule,
    TasksModule,
    // Phase 116b: the automation attachment-sweep contributor — see the module doc
    // for why this can't just be TasksModule importing AutomationsModule directly.
    AttachmentSetRefsModule,
    // F8a (O6): the no-cycle briefing→chat-transcript announcer — see the module
    // doc for why this can't just be BriefingModule importing ChatModule directly.
    BriefingTranscriptSinkModule,
  ],
})
export class AppModule {}
