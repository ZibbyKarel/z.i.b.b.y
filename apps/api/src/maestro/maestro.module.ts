import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MonitorsModule } from "../monitors/monitors.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { TasksModule } from "../tasks/tasks.module";
import { MaestroController } from "./maestro.controller";
import { MaestroService } from "./maestro.service";
import { MergeWatchModule } from "./merge-watch.module";
import { PostMergeWatchService } from "./post-merge-watch.service";

/**
 * NS2 F5b — Maestro's read-side merge queue. A leaf module (like
 * `SentinelModule`): `ProjectsModule` (for `ProjectsStorageService` +
 * `ProjectPrService`, the exact pulls-fetch it reuses), `ResolvedProjectModule`
 * + `IntegrationsModule` (the shared `resolveGithubToken` seam). No cycle risk
 * — none of these import `MaestroModule` back.
 *
 * NS2 F7b-2: also imports `MergeWatchModule` (the watch store `PostMergeWatchService`
 * polls/patches), `MonitorsModule` (its CI-status sidecar, reused as a cheap
 * "already-know-the-outcome" shortcut) and `TasksModule` (dispatches the gated fix
 * task on red). None of the three import `MaestroModule` back — `MonitorsModule`
 * imports `TasksModule` directly too, which is fine (no cycle, just a diamond).
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    MergeWatchModule,
    MonitorsModule,
    TasksModule,
  ],
  controllers: [MaestroController],
  providers: [MaestroService, PostMergeWatchService],
  exports: [MaestroService, PostMergeWatchService],
})
export class MaestroModule {}
