import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { dataDir } from "../shared/data-dir"
import { ClaudeCliRouter } from "./claude-cli-router"
import { KeywordScorer } from "./keyword-scorer"
import { ScheduledTasksStorageService, TASKS_DIR } from "./scheduled-tasks.storage.service"
import { TaskClassifierService } from "./task-classifier.service"
import { TASK_ROUTER } from "./task-router"
import { TaskSchedulerService } from "./task-scheduler.service"
import { TasksController } from "./tasks.controller"

/** Default scheduled-tasks dir, anchored to `apps/api/data/tasks/scheduled`. */
export function resolveTasksDir(): string {
  return process.env.TASKS_DIR ?? dataDir("tasks", "scheduled")
}

/**
 * Task routing + the deferred-task scheduler. Reuses the agents and pipelines
 * stores (imported for their catalog) and their runner services (to dispatch a
 * task — immediately or when a scheduled one comes due). The primary router is the
 * `claude -p` AI categorizer; the keyword scorer is the always-available fallback.
 */
@Module({
  imports: [AgentsModule, PipelinesModule],
  controllers: [TasksController],
  providers: [
    { provide: TASKS_DIR, useFactory: resolveTasksDir },
    ScheduledTasksStorageService,
    TaskSchedulerService,
    TaskClassifierService,
    KeywordScorer,
    { provide: TASK_ROUTER, useClass: ClaudeCliRouter },
  ],
  // Exported so the channel triage flow (Phase 5.3) can dispatch a task and read
  // its outcome back onto the channel item.
  exports: [TaskSchedulerService, ScheduledTasksStorageService],
})
export class TasksModule {}
