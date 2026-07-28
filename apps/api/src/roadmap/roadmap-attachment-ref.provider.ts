import { Injectable } from "@nestjs/common";
import type { AttachmentSetRefProvider } from "../tasks/attachment-set-ref-provider";
import { RoadmapStore } from "./roadmap.store";

/**
 * Contributes every roadmap item's `attachmentSetId`, across every project,
 * to `TaskSchedulerService`'s 24h orphan sweep exemption list (see
 * `AttachmentSetRefProvider`). A roadmap item's imported/attached files must
 * survive independently of any `ScheduledTask` — most items never become one
 * until `play` (125e) creates the task, and even after that the item keeps
 * referencing the same set for its whole lifetime, long past a single run.
 * Modeled directly on `AutomationAttachmentRefProvider` (same reasoning, same
 * shape) — provided by `attachment-set-refs.module.ts`, not by
 * `RoadmapModule` itself, mirroring how the automation contributor is wired.
 */
@Injectable()
export class RoadmapAttachmentRefProvider implements AttachmentSetRefProvider {
  constructor(private readonly roadmap: RoadmapStore) {}

  async referencedSetIds(): Promise<string[]> {
    const ids: string[] = [];
    for (const projectId of await this.roadmap.projectIds()) {
      const items = await this.roadmap.list(projectId);
      for (const item of items) {
        if (item.attachmentSetId) ids.push(item.attachmentSetId);
      }
    }
    return ids;
  }
}
