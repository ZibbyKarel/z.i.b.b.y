import * as path from "node:path";
import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { AttachmentStorageService } from "../tasks/attachment-storage.service";
import { LEVEL_MAPPING_FILE, LevelMappingStore } from "./level-mapping.store";
import { RoadmapController } from "./roadmap.controller";
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

@Module({
  // 125b — RoadmapSourceService needs a real project (ProjectsModule),
  // its resolved (company-merged) integrations (ResolvedProjectModule) and
  // their stored credentials (IntegrationsModule). None of the three imports
  // back into RoadmapModule (only `app.module.ts` and
  // `attachment-set-refs.module.ts` do), so plain imports are safe here —
  // no cycle, no `forwardRef` needed on this side.
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule],
  controllers: [RoadmapController],
  providers: [
    { provide: ROADMAP_DIR, useFactory: resolveRoadmapDir },
    RoadmapStore,
    { provide: LEVEL_MAPPING_FILE, useFactory: resolveLevelMappingFile },
    LevelMappingStore,
    // A fresh instance rather than importing TasksModule for the one already-
    // exported provider: AttachmentStorageService takes no constructor args
    // (no DI token, just `dataDir()`), so a second instance here is
    // stateless and equivalent — and avoids pulling TasksModule's much larger
    // import graph into RoadmapModule for a single leaf class.
    AttachmentStorageService,
    RoadmapSourceService,
  ],
  // RoadmapStore is exported so attachment-set-refs.module.ts can provide
  // RoadmapAttachmentRefProvider (which depends on it) without RoadmapModule
  // importing back into tasks/ — same seam as AutomationsModule/
  // AutomationsStorageService.
  exports: [RoadmapStore],
})
export class RoadmapModule {}
