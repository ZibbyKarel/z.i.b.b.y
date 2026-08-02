import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { GateRulesModule } from "../gate-rules/gate-rules.module";
import { GatesModule } from "../gates/gates.module";
import { HeraldModule } from "../herald/herald.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MandateModule } from "../mandate/mandate.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
import { CHANNELS_DIR, ChannelItemStore } from "./channel-item.store";
import { ChannelEventsService } from "./channel-events.service";
import { ChannelTriageFlowService } from "./channel-triage-flow.service";
import { CHANNEL_TRIAGE_FLOW, ChannelWatcherService } from "./channel-watcher.service";
import { ChannelsController } from "./channels.controller";
import { JiraIssueFlowService } from "./jira-issue-flow.service";
import { SourceLinkBackfillService } from "./source-link-backfill.service";
import { ClaudeCliTriager } from "./triage/claude-cli-triager";
import { KeywordTriager } from "./triage/keyword-triager";
import { TRIAGE_ROUTER } from "./triage/triage-router";
import { TriageService } from "./triage/triage.service";

/** Default channels dir, anchored to `apps/api/data/channels`. */
export function resolveChannelsDir(): string {
  return process.env.CHANNELS_DIR ?? dataDir("channels");
}

/**
 * Channels (Phase 5.2): inbound ingestion. Imports IntegrationsModule for the
 * integrations store, credentials store and adapter registry. Owns the item store,
 * the SSE push source and the watcher heartbeat. 5.3 adds the triage flow + mandate
 * as providers here (bound to CHANNEL_TRIAGE_FLOW). Nothing imports this module, so
 * it can sit above the tasks/gates/approvals modules without a cycle. Phase 70:
 * also imports ResolvedProjectModule so the triage flow's VIP check reads a
 * project's EFFECTIVE (company-merged) roster, not just its own local `people`.
 */
@Module({
  imports: [
    IntegrationsModule,
    MandateModule,
    TasksModule,
    GatesModule,
    GateRulesModule,
    ApprovalsModule,
    ProjectsModule,
    ResolvedProjectModule,
    HeraldModule,
  ],
  controllers: [ChannelsController],
  providers: [
    { provide: CHANNELS_DIR, useFactory: resolveChannelsDir },
    ChannelItemStore,
    ChannelEventsService,
    KeywordTriager,
    { provide: TRIAGE_ROUTER, useClass: ClaudeCliTriager },
    TriageService,
    ChannelTriageFlowService,
    { provide: CHANNEL_TRIAGE_FLOW, useExisting: ChannelTriageFlowService },
    ChannelWatcherService,
    JiraIssueFlowService,
    SourceLinkBackfillService,
  ],
  exports: [ChannelItemStore, ChannelEventsService],
})
export class ChannelsModule {}
