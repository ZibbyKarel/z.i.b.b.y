import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { LimitsModule } from "../limits/limits.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { LimitResumeService } from "./limit-resume.service"

/**
 * Phase 9.2 — the usage-limit auto-resume daemon. Sits ABOVE the two runners (it
 * consumes both registries to find `paused-limit` runs), so it lives in its own
 * module rather than inside Agents/Pipelines (a resumer inside either would close a
 * DI cycle). TasksModule is intentionally untouched: window-deferred *tasks* ride the
 * existing task tick (Phase 9.1, decision 4); only *runs* are expensive to flap and
 * need this bounded resumer.
 */
@Module({
  imports: [LimitsModule, AgentsModule, PipelinesModule],
  providers: [LimitResumeService],
  exports: [LimitResumeService],
})
export class LimitResumeModule {}
