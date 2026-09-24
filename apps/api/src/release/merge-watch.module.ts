import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { MERGE_WATCH_DIR, MergeWatchStore } from "./merge-watch.store";

/** Default merge-watch dir, anchored to `apps/api/data/maestro/merge-watch`. */
export function resolveMergeWatchDir(): string {
  return process.env.MERGE_WATCH_DIR ?? dataDir("maestro/merge-watch");
}

/**
 * NS2 F7b-2 — a leaf module (imports nothing of its own, like `MonitorsModule`'s
 * event store): both `ProjectsModule` (`ProjectPrService.merge` records into it)
 * and `MaestroModule` (`PostMergeWatchService` polls it) import this directly, and
 * `BriefingModule` reads it for the `mergedRecently` extras array. No cycle risk —
 * nothing this module imports imports it back (it imports nothing).
 */
@Module({
  providers: [{ provide: MERGE_WATCH_DIR, useFactory: resolveMergeWatchDir }, MergeWatchStore],
  exports: [MergeWatchStore],
})
export class MergeWatchModule {}
