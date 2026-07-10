import { Injectable } from "@nestjs/common";
import type { AttachmentSetRefProvider } from "../tasks/attachment-set-ref-provider";
import { AutomationsStorageService } from "./automations.storage.service";

/**
 * Contributes the attachment-set ids referenced by `task`-target automations to
 * `TaskSchedulerService`'s 24h orphan sweep exemption list (Phase 116b — see
 * `AttachmentSetRefProvider`). A prompt automation's uploaded files must survive
 * past the sweep TTL between cron fires; the automation record itself is the only
 * durable reference until the moment it actually dispatches (and becomes an
 * ordinary, already-exempt `ScheduledTask`), so this reads
 * `AutomationsStorageService` directly rather than the scheduled-tasks store.
 */
@Injectable()
export class AutomationAttachmentRefProvider implements AttachmentSetRefProvider {
  constructor(private readonly automations: AutomationsStorageService) {}

  async referencedSetIds(): Promise<string[]> {
    const automations = await this.automations.list();
    const ids: string[] = [];
    for (const automation of automations) {
      if (automation.target.type === "task" && automation.target.attachmentSetId) {
        ids.push(automation.target.attachmentSetId);
      }
    }
    return ids;
  }
}
