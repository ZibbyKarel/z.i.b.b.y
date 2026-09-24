import { Inject, Injectable } from "@nestjs/common";
import { type MergeWatch, MergeWatchSchema } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";

export const MERGE_WATCH_DIR = "MERGE_WATCH_DIR";

/** Watch ids are deterministic (`merge-<repo-slug>-<sha>`) — same shape as monitor events. */
const MERGE_WATCH_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class MergeWatchNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Merge watch "${id}" not found`);
    this.name = "MergeWatchNotFoundError";
  }
}
export class InvalidMergeWatchIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid merge watch id: "${id}"`);
    this.name = "InvalidMergeWatchIdError";
  }
}

/**
 * NS2 F7b-2 — file-backed merge watches, one `<id>.json` each. Modeled directly
 * on {@link MonitorEventStore}: `putNew` is a pure dedup create (a re-merge of
 * the same sha is a no-op), `patch` is the read-merge-write state transition
 * `PostMergeWatchService` drives (`watching` → `green`/`red`/`expired`). No HTTP
 * endpoint — this store is internal to the merge-record → post-merge-poll loop.
 */
@Injectable()
export class MergeWatchStore extends EntityFileStore<MergeWatch> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = MERGE_WATCH_ID_REGEX;

  constructor(@Inject(MERGE_WATCH_DIR) dir: string) {
    super(dir);
  }

  protected idOf(watch: MergeWatch): string {
    return watch.id;
  }

  protected serialize(watch: MergeWatch): string {
    return `${JSON.stringify(watch, null, 2)}\n`;
  }

  protected tryParse(raw: string): MergeWatch | null {
    return this.parseJson(MergeWatchSchema, raw);
  }

  protected compare(a: MergeWatch, b: MergeWatch): number {
    return b.mergedAt.localeCompare(a.mergedAt);
  }

  protected notFound(id: string): Error {
    return new MergeWatchNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidMergeWatchIdError(id);
  }

  /** Persist a NEW watch; an existing id (same repo+sha) is a dedup hit → null. */
  async putNew(watch: MergeWatch): Promise<MergeWatch | null> {
    return this.createEntity(watch.id, () => watch);
  }

  /** Patch a watch (state/attempts/taskId transitions) — read-merge-write. */
  async patch(id: string, patch: Partial<MergeWatch>): Promise<MergeWatch> {
    const existing = await this.get(id);
    const merged = { ...existing, ...patch, id: existing.id };
    await this.writeEntity(merged);
    return merged;
  }

  /** Watches currently in the `watching` state — what `PostMergeWatchService` polls. */
  async listWatching(): Promise<MergeWatch[]> {
    const all = await this.list();
    return all.filter((w) => w.state === "watching");
  }
}
