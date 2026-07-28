import * as path from "node:path";
import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { LEVEL_MAPPING_FILE, LevelMappingStore } from "./level-mapping.store";
import { RoadmapController } from "./roadmap.controller";
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
  controllers: [RoadmapController],
  providers: [
    { provide: ROADMAP_DIR, useFactory: resolveRoadmapDir },
    RoadmapStore,
    { provide: LEVEL_MAPPING_FILE, useFactory: resolveLevelMappingFile },
    LevelMappingStore,
  ],
  // RoadmapStore is exported so attachment-set-refs.module.ts can provide
  // RoadmapAttachmentRefProvider (which depends on it) without RoadmapModule
  // importing back into tasks/ — same seam as AutomationsModule/
  // AutomationsStorageService.
  exports: [RoadmapStore],
})
export class RoadmapModule {}
