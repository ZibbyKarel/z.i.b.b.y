import * as path from "node:path";
import { Global, Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { AttachmentStorageService } from "../tasks/attachment-storage.service";
import { TasksModule } from "../tasks/tasks.module";
import { LEVEL_MAPPING_FILE, LevelMappingStore } from "./level-mapping.store";
import { RoadmapController } from "./roadmap.controller";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoadmapSourceService } from "./roadmap-source.service";
import { ROADMAP_DIR, RoadmapStore } from "./roadmap.store";

/** Default roadmap dir, anchored to `.zibby/data/roadmap`. */
export function resolveRoadmapDir(): string {
  return process.env.ROADMAP_DIR ?? dataDir("roadmap");
}

/** The global level-mapping document lives alongside the per-project item dirs. */
function resolveLevelMappingFile(): string {
  return path.join(resolveRoadmapDir(), "_level-mapping.json");
}

/**
 * 125e — `ProjectPrService.recordMerge` (in `ProjectsModule`) needs to call
 * `RoadmapGateService.onMerge`. Rather than have `ProjectsModule` import
 * `RoadmapModule` back (which — through `ProjectsModule` also being a dependency of
 * `AgentsModule`/`TasksModule`, both imported by `app.module.ts` BEFORE
 * `RoadmapModule` — produces a genuine four-file `require()` cycle:
 * `agents.module.ts` → `projects.module.ts` → `roadmap.module.ts` →
 * `tasks.module.ts` → `agents.module.ts`, which crashes Nest's scanner no matter
 * how the individual edges are `forwardRef`d, because `forwardRef` only defers
 * NestJS's OWN read of a wrapped reference — it does nothing about the underlying
 * `import` statements, which Node still evaluates eagerly in file order), this
 * module is `@Global()`: its providers (`RoadmapStore`, `RoadmapGateService`) are
 * available everywhere once this module loads ONCE (from `app.module.ts`), with NO
 * module needing to add it to its own `imports: []`.
 *
 * `project-pr.service.ts` still needs a real (non-type-only) `import {
 * RoadmapGateService } from "../roadmap/roadmap-gate.service"` for
 * `@Inject(forwardRef(() => RoadmapGateService))`, and `roadmap-gate.service.ts`
 * symmetrically imports `ProjectPrService` — a two-file cycle, but an ISOLATED one
 * (neither file's other imports reach back through it), so `forwardRef` on both of
 * those two provider injections resolves it cleanly with no wider blast radius.
 */
@Global()
@Module({
  // 125b — RoadmapSourceService needs a real project (ProjectsModule),
  // its resolved (company-merged) integrations (ResolvedProjectModule) and
  // their stored credentials (IntegrationsModule).
  //
  // 125e — `RoadmapGateService` needs `TaskSchedulerService`/
  // `ScheduledTasksStorageService`/`TaskRunsService` (TasksModule) to create/read
  // the tasks it dispatches, and `ProjectPrService` (exported by ProjectsModule)
  // for the merge-state poll. See this file's docblock for why `@Global()`
  // replaces a `ProjectsModule -> RoadmapModule` import edge rather than adding
  // one — every import below stays a plain, non-circular edge.
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule, TasksModule],
  controllers: [RoadmapController],
  providers: [
    { provide: ROADMAP_DIR, useFactory: resolveRoadmapDir },
    RoadmapStore,
    { provide: LEVEL_MAPPING_FILE, useFactory: resolveLevelMappingFile },
    LevelMappingStore,
    // A fresh instance rather than reusing TasksModule's exported one:
    // AttachmentStorageService takes no constructor args (no DI token, just
    // `dataDir()`), so a second instance here is stateless and equivalent —
    // and avoids re-plumbing RoadmapSourceService's existing constructor.
    AttachmentStorageService,
    RoadmapSourceService,
    RoadmapGateService,
  ],
  // RoadmapStore is exported so attachment-set-refs.module.ts can provide
  // RoadmapAttachmentRefProvider (which depends on it) without RoadmapModule
  // importing back into tasks/ — same seam as AutomationsModule/
  // AutomationsStorageService. RoadmapGateService is exported (and, being
  // `@Global()`, needs no importer) so `ProjectPrService` can inject it (125e).
  exports: [RoadmapStore, RoadmapGateService],
})
export class RoadmapModule {}
