import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { ClaudeCliRouter } from "./claude-cli-router"
import { KeywordScorer } from "./keyword-scorer"
import { TaskClassifierService } from "./task-classifier.service"
import { TASK_ROUTER } from "./task-router"
import { TasksController } from "./tasks.controller"

/**
 * Task routing. Reuses the agents and pipelines stores (imported for their
 * exported storage services) to build the candidate catalog. The primary router
 * is the `claude -p` AI categorizer; the keyword scorer is the always-available
 * fallback bound separately so it can also back the router via DI.
 */
@Module({
  imports: [AgentsModule, PipelinesModule],
  controllers: [TasksController],
  providers: [
    TaskClassifierService,
    KeywordScorer,
    { provide: TASK_ROUTER, useClass: ClaudeCliRouter },
  ],
})
export class TasksModule {}
