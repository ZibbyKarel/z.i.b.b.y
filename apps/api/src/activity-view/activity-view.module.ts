import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { ActivityViewController } from "./activity-view.controller";
import { ACTIVITY_VIEW_FILE, ActivityViewStorageService } from "./activity-view.storage.service";

/** Default activity-view file, anchored to `apps/api/data/activity-view.json`. */
export function resolveActivityViewFile(): string {
  return process.env.ACTIVITY_VIEW_FILE ?? dataDir("activity-view.json");
}

/**
 * The RightRail live-log display config (the {@link MandateModule} twin) — a single
 * operator-owned document. Read by the web rail to decide which activity groups are
 * visible / grouped / hidden; written only by the operator's Settings → Activity
 * section.
 */
@Module({
  controllers: [ActivityViewController],
  providers: [
    { provide: ACTIVITY_VIEW_FILE, useFactory: resolveActivityViewFile },
    ActivityViewStorageService,
  ],
  exports: [ActivityViewStorageService],
})
export class ActivityViewModule {}
