import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { SubsystemId } from "@zibby/contracts";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the subsystem-seen file. */
export const SUBSYSTEM_SEEN_FILE = "SUBSYSTEM_SEEN_FILE";

/** Everything reads as unseen before any record exists — the zero value of "last visited". */
export const SUBSYSTEM_SEEN_EPOCH = new Date(0).toISOString();

/**
 * `{ [subsystemId]: IsoDateTime }`. Loosely keyed on plain strings (not
 * `SubsystemIdSchema`) so a stale entry for a since-removed id degrades to
 * "simply unread" (`.seenAt` never looks it up) instead of invalidating the
 * whole file — mirrors `GateRulesStorageService`'s tolerant-parse posture.
 */
const SeenMapSchema = z.record(z.string(), z.string());
type SeenMap = z.infer<typeof SeenMapSchema>;

/**
 * Phase 82 — durable "last visited" timestamp per subsystem, driving the
 * `report` (Tier-2 report) window: a run that completed after this timestamp
 * counts toward the badge. The operator opening the subsystem's drawer
 * (`markSubsystemSeen`) resets it to now — Tier-3 (`waiting`) items are NOT cleared
 * by this; they resolve only through the existing approvals flow (design doc:
 * different acknowledgment models).
 *
 * File-backed, tiny — `.zibby/data/subsystem-seen.json`. A missing file or
 * missing key reads as {@link SUBSYSTEM_SEEN_EPOCH} (unseen); writes are atomic
 * (temp file + rename), mirroring `GateRulesStorageService`/`MachineConfigStore`.
 */
@Injectable()
export class SubsystemSeenStore {
  private readonly dir: string;

  constructor(@Inject(SUBSYSTEM_SEEN_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
  }

  /** When `id` was last seen — {@link SUBSYSTEM_SEEN_EPOCH} when never recorded. */
  async seenAt(id: SubsystemId): Promise<string> {
    const map = await this.read();
    return map[id] ?? SUBSYSTEM_SEEN_EPOCH;
  }

  /** Record `id` as seen right now; returns the written timestamp. */
  async markSeen(id: SubsystemId): Promise<string> {
    const map = await this.read();
    const now = new Date().toISOString();
    await this.persist({ ...map, [id]: now });
    return now;
  }

  private async read(): Promise<SeenMap> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return {};
    const parsed = SeenMapSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : {};
  }

  private async persist(map: SeenMap): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(map, null, 2)}\n`);
  }
}
