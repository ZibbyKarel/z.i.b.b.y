import { Module } from "@nestjs/common";
import { AgentFactoryModule } from "../agent-factory/agent-factory.module";
import { AgentsModule } from "../agents/agents.module";
import { BriefingModule } from "../briefing/briefing.module";
import { GapsModule } from "../gaps/gaps.module";
import { LoomModule } from "../loom/loom.module";
import { MemoryDistillerModule } from "../memory/memory-distiller.module";
import { PatternsModule } from "../patterns/patterns.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { SelfKnowledgeModule } from "../self-knowledge/self-knowledge.module";
import { SentinelModule } from "../sentinel/sentinel.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
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
 * services). No cycle — the runner modules don't depend on this one. Discovery and
 * Research are no longer imported here (Phase 116a): the scheduler dropped their
 * targets, and both modules are registered directly in `app.module.ts` so their
 * controllers keep working. Phase 116b: also imports `TasksModule` so the `task`
 * target can dispatch through `TaskSchedulerService.createTask` — still no cycle,
 * `TasksModule` doesn't (and must never) import this module back (see
 * `attachment-set-refs.module.ts` for how the reverse reference the sweep needs is
 * wired without one). F4c: also imports `SelfKnowledgeModule` so the `self-knowledge`
 * target can dispatch straight to `SelfKnowledgeService` — no cycle, `SelfKnowledgeModule`
 * only imports Agents/Pipelines/GateRules/Gates/Memory, none of which import this module.
 * NS2 F5a: also imports `SentinelModule` (a leaf, same position as `GapsModule`) so the
 * `sentinel-scan` target can dispatch to `SentinelService.scan`. NS2 F5c: also imports
 * `LoomModule` (same leaf position) so the `loom-audit` target can dispatch to
 * `LoomService.audit`.
 */
@Module({
  imports: [
    AgentFactoryModule,
    AgentsModule,
    BriefingModule,
    GapsModule,
    LoomModule,
    MemoryDistillerModule,
    PatternsModule,
    PipelinesModule,
    SelfKnowledgeModule,
    SentinelModule,
    TasksModule,
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
