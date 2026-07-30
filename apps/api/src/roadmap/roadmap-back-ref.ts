import type { RoadmapItem } from "@zibby/contracts";
import type { ScopedLogger } from "../shared/logging/logger.service";
import type { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";

/** `ScheduledTask.roadmapItemLabel` is capped at 512 chars by the contract. */
const LABEL_MAX_CHARS = 512;

/**
 * The human label snapshotted onto a task's `roadmapItemLabel`: the item's
 * external key when it has one (`CZ3TDR1-524` — stable, short, and what the
 * operator actually recognises), else its own name. Snapshotted rather than
 * resolved on read so a run stays self-describing after the item is renamed or
 * deleted, and so no run-read has to reach into the roadmap store.
 */
export function roadmapItemLabel(item: RoadmapItem): string {
  const label = item.source?.externalKey?.trim() || item.name;
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS - 1)}…` : label;
}

/**
 * Write the REVERSE edge of `RoadmapItem.runs[].taskId` onto the task record, so
 * a run detail can link back to the issue it solves without scanning every
 * project's roadmap (see `ScheduledTask.roadmapItemId`).
 *
 * Deliberately BEST-EFFORT and never throwing: by the time this runs the task
 * already exists and its run is already dispatching, and the forward edge
 * (`runs[].taskId`, written by the caller straight after) is the authoritative
 * one — this is a convenience index. A storage hiccup here must degrade to "the
 * run detail shows no issue link", never to a failed release.
 *
 * Shared by both callers that turn a roadmap item into a task —
 * `RoadmapGateService.release()` (an ordinary item) and
 * `RoadmapDecompositionService.dispatch()` (a childless epic) — so the two can
 * never disagree about what a back-ref looks like.
 */
export async function writeRoadmapBackRef(
  scheduledTasks: ScheduledTasksStorageService,
  log: ScopedLogger,
  taskId: string,
  item: RoadmapItem,
): Promise<void> {
  try {
    await scheduledTasks.setRoadmapRef(taskId, item.id, roadmapItemLabel(item));
  } catch (error) {
    log.warn("roadmap back-ref write failed (non-fatal — the release itself stands)", {
      projectId: item.projectId,
      itemId: item.id,
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
