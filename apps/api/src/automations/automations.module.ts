import * as path from "node:path"
import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { SkillsModule } from "../skills/skills.module"
import { AUTOMATIONS_DIR, AutomationsStorageService } from "./automations.storage.service"
import { AutomationsController } from "./automations.controller"
import { SchedulerService } from "./scheduler.service"

/** Default automations dir, anchored to `apps/api/data/automations`. */
export function resolveAutomationsDir(): string {
  return process.env.AUTOMATIONS_DIR ?? path.resolve(__dirname, "..", "..", "data", "automations")
}

/**
 * Automations + the scheduler daemon. Imports the runner modules so the scheduler
 * can start agent/skill/pipeline runs on a trigger (those modules export their
 * runner services). No cycle — the runner modules don't depend on this one.
 */
@Module({
  imports: [AgentsModule, SkillsModule, PipelinesModule],
  controllers: [AutomationsController],
  providers: [
    { provide: AUTOMATIONS_DIR, useFactory: resolveAutomationsDir },
    AutomationsStorageService,
    SchedulerService,
  ],
  exports: [AutomationsStorageService, SchedulerService],
})
export class AutomationsModule {}
