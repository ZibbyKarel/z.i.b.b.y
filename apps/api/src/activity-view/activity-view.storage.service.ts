import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { type ActivityView, ActivityViewSchema, DEFAULT_ACTIVITY_VIEW } from "@zibby/contracts";
import { safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the activity-view file path (a single JSON doc at the data root). */
export const ACTIVITY_VIEW_FILE = "ACTIVITY_VIEW_FILE";

/**
 * The RightRail live-log display config: one operator-owned `activity-view.json` at
 * the data root (the {@link MandateStorageService} twin). Tolerant read — a missing
 * or malformed file falls back to {@link DEFAULT_ACTIVITY_VIEW}, and the file is
 * seeded on first boot. Only the operator's PUT writes it; nothing inbound can.
 */
@Injectable()
export class ActivityViewStorageService implements OnModuleInit {
  private readonly file: string;

  constructor(@Inject(ACTIVITY_VIEW_FILE) file: string) {
    this.file = path.resolve(file);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    if (!(await this.exists())) await this.write(DEFAULT_ACTIVITY_VIEW);
  }

  /** The current view, defaulting to the seeded default if absent/broken. */
  async read(): Promise<ActivityView> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return DEFAULT_ACTIVITY_VIEW;
    const parsed = ActivityViewSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : DEFAULT_ACTIVITY_VIEW;
  }

  /** Persist a validated view (atomic). */
  async write(view: ActivityView): Promise<ActivityView> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await writeFileAtomic(this.file, JSON.stringify(view, null, 2));
    return view;
  }

  private exists(): Promise<boolean> {
    return fs
      .access(this.file)
      .then(() => true)
      .catch(() => false);
  }
}
