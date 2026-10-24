import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
import { ProjectHealthController } from "./project-health.controller";
import { PROJECT_HEALTH_DIR, ProjectHealthStore } from "./project-health.store";
import { ProjectHealthWatcherService } from "./project-health-watcher.service";

/** Default project-health status dir, anchored to the data root. */
export function resolveProjectHealthDir(): string {
  return process.env.PROJECT_HEALTH_DIR ?? dataDir("project-health");
}

/**
 * Per-project health monitoring (TODO 11): the status store, the watcher
 * (projects → `checkUrl` → status + transition activity) and the controller.
 * Reads projects from `ProjectsStorageService`; `analyze` dispatches through
 * the ordinary `TaskSchedulerService`.
 */
@Module({
  imports: [ProjectsModule, TasksModule],
  controllers: [ProjectHealthController],
  providers: [
    { provide: PROJECT_HEALTH_DIR, useFactory: resolveProjectHealthDir },
    ProjectHealthStore,
    ProjectHealthWatcherService,
  ],
  exports: [ProjectHealthStore],
})
export class ProjectHealthModule {}
