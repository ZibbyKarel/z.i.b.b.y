import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type OperatorChannelSettings,
  OperatorChannelSettingsSchema,
  type OperatorDeliveryEntry,
  OperatorDeliveryEntrySchema,
} from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the directory holding `operator-channel.json` + `deliveries.jsonl`. */
export const OPERATOR_CHANNEL_DIR = "OPERATOR_CHANNEL_DIR";

const SETTINGS_FILE = "operator-channel.json";
const DELIVERIES_FILE = "deliveries.jsonl";

/**
 * The operator channel's files: the settings document (no secrets — tokens live in
 * the credentials store) and the append-only delivery log, the answer to "what did
 * you tell me?" (Law 5). Settings are cached after the first read (one process
 * writes them); a missing or garbage file reads as the schema defaults (disabled).
 *
 * ponytail: one ever-growing `deliveries.jsonl`, read whole for the tail — a
 * notification is a handful a day; rotate per day (the activity-log shape) if it
 * ever matters.
 */
@Injectable()
export class OperatorChannelStore {
  private cached: OperatorChannelSettings | null = null;

  constructor(@Inject(OPERATOR_CHANNEL_DIR) private readonly dir: string) {}

  async readSettings(): Promise<OperatorChannelSettings> {
    if (this.cached) return this.cached;
    const raw = await fs.readFile(path.join(this.dir, SETTINGS_FILE), "utf8").catch(() => null);
    const parsed = OperatorChannelSettingsSchema.safeParse(raw === null ? {} : safeJson(raw));
    this.cached = parsed.success ? parsed.data : OperatorChannelSettingsSchema.parse({});
    return this.cached;
  }

  async writeSettings(settings: OperatorChannelSettings): Promise<OperatorChannelSettings> {
    const next = OperatorChannelSettingsSchema.parse(settings);
    await ensureDir(this.dir);
    await writeFileAtomic(path.join(this.dir, SETTINGS_FILE), `${JSON.stringify(next, null, 2)}\n`);
    this.cached = next;
    return next;
  }

  /** Append one delivery line (one `appendFile` — the activity-log precedent). */
  async appendDelivery(entry: OperatorDeliveryEntry): Promise<void> {
    await ensureDir(this.dir);
    await fs.appendFile(
      path.join(this.dir, DELIVERIES_FILE),
      `${JSON.stringify(OperatorDeliveryEntrySchema.parse(entry))}\n`,
      "utf8",
    );
  }

  /** The newest `limit` deliveries, newest first; torn/garbage lines are skipped. */
  async recentDeliveries(limit = 50): Promise<OperatorDeliveryEntry[]> {
    const raw = await fs.readFile(path.join(this.dir, DELIVERIES_FILE), "utf8").catch(() => "");
    const out: OperatorDeliveryEntry[] = [];
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      const line = lines[i];
      if (!line) continue;
      const parsed = OperatorDeliveryEntrySchema.safeParse(safeJson(line));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }
}
