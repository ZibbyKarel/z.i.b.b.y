import { Module } from "@nestjs/common";
import { AgentFactoryModule } from "../agent-factory/agent-factory.module";
import { AgentsModule } from "../agents/agents.module";
import { BriefingModule } from "../briefing/briefing.module";
import { DiscoveryModule } from "../discovery/discovery.module";
import { GapsModule } from "../gaps/gaps.module";
import { IdeasModule } from "../ideas/ideas.module";
import { MemoryDistillerModule } from "../memory/memory-distiller.module";
import { PatternsModule } from "../patterns/patterns.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ResearchModule } from "../research/research.module";
import { dataDir } from "../shared/data-dir";
import { AUTOMATIONS_DIR, AutomationsStorageService } from "./automations.storage.service";
import { AutomationsController } from "./automations.controller";
import { SchedulerService } from "./scheduler.service";

/** Default automations dir, anchored to `apps/api/data/automations`. */
export function resolveAutomationsDir(): string {
  return process.env.AUTOMATIONS_DIR ?? dataDir("automations");
}

/**
 * Automations + the scheduler daemon. Imports the runner modules so the scheduler
 * can start agent/pipeline runs on a trigger (those modules export their runner
 * services). No cycle — the runner modules don't depend on this one.
 */
@Module({
  imports: [
    AgentFactoryModule,
    AgentsModule,
    BriefingModule,
    DiscoveryModule,
    GapsModule,
    IdeasModule,
    MemoryDistillerModule,
    PatternsModule,
    PipelinesModule,
    ResearchModule,
  ],
  controllers: [AutomationsController],
  providers: [
    { provide: AUTOMATIONS_DIR, useFactory: resolveAutomationsDir },
    AutomationsStorageService,
    SchedulerService,
  ],
  exports: [AutomationsStorageService, SchedulerService],
})
export class AutomationsModule {}
