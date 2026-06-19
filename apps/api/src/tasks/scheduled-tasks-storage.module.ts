import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { ScheduledTasksStorageService, TASKS_DIR } from "./scheduled-tasks.storage.service";

/** Default scheduled-tasks dir, anchored to `apps/api/data/tasks/scheduled`. */
export function resolveTasksDir(): string {
  return process.env.TASKS_DIR ?? dataDir("tasks", "scheduled");
}

/**
 * The scheduled-tasks store on its own, so BOTH `TasksModule` (the scheduler) and
 * `BudgetModule` (which reads queued/held counts for the status endpoint) can depend
 * on it without a module cycle — TasksModule imports BudgetModule, so BudgetModule
 * must not import TasksModule.
 */
@Module({
  providers: [{ provide: TASKS_DIR, useFactory: resolveTasksDir }, ScheduledTasksStorageService],
  exports: [ScheduledTasksStorageService],
})
export class ScheduledTasksStorageModule {}
