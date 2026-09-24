import { Module } from "@nestjs/common";
import { HandoffModule } from "../handoff/handoff.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MonitorsModule } from "../monitors/monitors.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { ReleaseController } from "./release.controller";
import { ReleaseService } from "./release.service";
import { MergeWatchModule } from "./merge-watch.module";
import { PostMergeWatchService } from "./post-merge-watch.service";

/**
 * NS2 F5b — Release's read-side merge queue. A leaf module (like
 * `SecurityModule`): `ProjectsModule` (for `ProjectsStorageService` +
 * `ProjectPrService`, the exact pulls-fetch it reuses), `ResolvedProjectModule`
 * + `IntegrationsModule` (the shared `resolveGithubToken` seam). No cycle risk
 * — none of these import `ReleaseModule` back.
 *
 * NS2 F7b-2: also imports `MergeWatchModule` (the watch store `PostMergeWatchService`
 * polls/patches) and `MonitorsModule` (its CI-status sidecar, reused as a cheap
 * "already-know-the-outcome" shortcut). None of these import `ReleaseModule` back.
 *
 * A3: `TasksModule` dropped — `PostMergeWatchService` no longer dispatches the
 * red-verdict fix task directly; it hands a `post-merge-red` signal to
 * `HandoffModule`'s rule engine instead (which carries `TaskSchedulerService`
 * itself for the actual dispatch).
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    MergeWatchModule,
    MonitorsModule,
    HandoffModule,
  ],
  controllers: [ReleaseController],
  providers: [ReleaseService, PostMergeWatchService],
  exports: [ReleaseService, PostMergeWatchService],
})
export class ReleaseModule {}
