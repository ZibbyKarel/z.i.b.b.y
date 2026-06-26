import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type ActivityEntry,
  ActivityEntrySchema,
  type ActivityKind,
  type ActivityPage,
  type ActivityRefs,
} from "@zibby/contracts";
import { collisionResistantId, ensureDir, safeJson } from "../shared/file-storage";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { ActivityEventsService } from "./activity-events.service";

/** DI token for the directory holding the append-only `<date>.jsonl` activity logs. */
export const ACTIVITY_DIR = "ACTIVITY_DIR";

/** What an emission site supplies; id/at/trace are stamped by {@link record}. */
export interface ActivityInput {
  kind: ActivityKind;
  summary: string;
  refs?: ActivityRefs;
}

/** Options for {@link ActivityLogService.list}. */
export interface ActivityListOptions {
  /** `YYYY-MM-DD`; defaults to today (derived from `now`). */
  date?: string;
  /** Restrict to these kinds. */
  kinds?: ActivityKind[];
  /** Newest-first cap (the controller defaults this to 50). */
  limit?: number;
  /** Keep only entries whose `refs.projectId` matches (per-project activity log). */
  projectId?: string;
  /** Keep only entries whose `refs.integrationId` matches. */
  integrationId?: string;
  /**
   * Look back this many days (today inclusive) instead of a single day. Ignored when
   * `date` is given. Used by the project/integration log so a sparse history shows.
   */
  days?: number;
}

/** Options for {@link ActivityLogService.page}. */
export interface ActivityPageOptions {
  /** Opaque `<at>|<id>` cursor — return entries strictly older than this one. */
  before?: string;
  /** Page size, clamped to [1, 200] (defaults to 50). */
  limit?: number;
  /** Restrict to these kinds. */
  kinds?: ActivityKind[];
}

/** The parsed keyset cursor — the `at`/`id` of the previous page's oldest entry. */
interface PageCursor {
  at: string;
  id: string;
}

const YYYY_MM_DD = (d: Date): string => d.toISOString().slice(0, 10);

/** Newest-first total order: by `at`, then `id` as a stable tiebreak. */
const byNewest = (a: ActivityEntry, b: ActivityEntry): number =>
  b.at.localeCompare(a.at) || b.id.localeCompare(a.id);

/** Parse a `<at>|<id>` cursor; a malformed/absent value means "from the newest". */
function parseCursor(before: string | undefined): PageCursor | null {
  if (!before) return null;
  const sep = before.lastIndexOf("|");
  if (sep <= 0 || sep === before.length - 1) return null;
  return { at: before.slice(0, sep), id: before.slice(sep + 1) };
}

/** True when `entry` sorts strictly after the cursor in newest-first order. */
function isOlderThanCursor(entry: ActivityEntry, cursor: PageCursor): boolean {
  if (entry.at !== cursor.at) return entry.at < cursor.at;
  return entry.id < cursor.id;
}

/**
 * The append-only activity log (Phase 6.1) — ZIBBY's accountability record. One
 * `<YYYY-MM-DD>.jsonl` file per day under {@link ACTIVITY_DIR}, one
 * `JSON.stringify(entry) + "\n"` per `fs.appendFile` (O_APPEND, a single write
 * syscall — the vault-daily precedent, NOT a read-modify-rename, which would race
 * concurrent emitters and be O(file) per entry). Rotation is just the date in the
 * filename; nothing rewrites an old file, ever.
 *
 * Reads are tolerant per line (`safeJson` + `safeParse`, bad lines skipped) so a
 * torn final line after a crash costs one entry, not the day. Every entry is
 * correlated for free from the active trace scope, and {@link record} NEVER throws
 * — accountability degrades, it never breaks actuation (every call site is a hot
 * path: dispatch, approve, gate-evaluate).
 *
 * `now` is injectable on every method so the day-boundary tests are deterministic
 * (the `tick(now)` precedent).
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @Inject(ACTIVITY_DIR) private readonly dir: string,
    private readonly trace: TraceContextService,
    private readonly events: ActivityEventsService,
  ) {}

  /**
   * Stamp, append and announce one activity entry. Fire-and-forget by contract —
   * call sites `void this.activity.record(...)`; any failure (an unwritable dir, a
   * malformed entry) is swallowed to a warn so the operation that emitted it is
   * never affected.
   */
  async record(input: ActivityInput, now: Date = new Date()): Promise<void> {
    try {
      const snap = this.trace.snapshot();
      const entry: ActivityEntry = ActivityEntrySchema.parse({
        id: collisionResistantId("act"),
        at: now.toISOString(),
        kind: input.kind,
        summary: input.summary,
        ...(snap.traceId ? { traceId: snap.traceId } : {}),
        ...(snap.runId ? { runId: snap.runId } : {}),
        refs: input.refs ?? {},
      });
      await ensureDir(this.dir);
      await fs.appendFile(
        this.fileFor(entry.at.slice(0, 10)),
        `${JSON.stringify(entry)}\n`,
        "utf8",
      );
      this.events.emit({ kind: entry.kind, at: entry.at, entry });
    } catch (error) {
      this.logger.warn(`activity record dropped (${input.kind}): ${String(error)}`);
    }
  }

  /**
   * Read activity newest-first, optionally filtered by kind and `refs`, and capped.
   * Reads a single day by default; a `projectId`/`integrationId` filter (or an
   * explicit `days`) widens the read to a multi-day window so a sparse per-project
   * history is still visible. An explicit `date` always pins to that one day.
   */
  async list(opts: ActivityListOptions = {}, now: Date = new Date()): Promise<ActivityEntry[]> {
    const windowed = opts.date === undefined && (opts.days !== undefined || this.hasRefFilter(opts));
    let entries: ActivityEntry[];
    if (windowed) {
      const since = new Date(now.getTime() - ((opts.days ?? 14) - 1) * 24 * 60 * 60 * 1000);
      since.setUTCHours(0, 0, 0, 0);
      entries = await this.readRange(since, now); // already newest-first
    } else {
      entries = (await this.readDay(opts.date ?? YYYY_MM_DD(now))).reverse();
    }
    if (opts.kinds && opts.kinds.length > 0) {
      const set = new Set(opts.kinds);
      entries = entries.filter((e) => set.has(e.kind));
    }
    if (opts.projectId) entries = entries.filter((e) => e.refs.projectId === opts.projectId);
    if (opts.integrationId) {
      entries = entries.filter((e) => e.refs.integrationId === opts.integrationId);
    }
    return opts.limit !== undefined ? entries.slice(0, opts.limit) : entries;
  }

  private hasRefFilter(opts: ActivityListOptions): boolean {
    return opts.projectId !== undefined || opts.integrationId !== undefined;
  }

  /**
   * Keyset (cursor) page over the WHOLE on-disk history, newest-first — the
   * RightRail live log's infinite query. `before` is the opaque `<at>|<id>` cursor
   * of the previous page's oldest entry; entries strictly older than it are
   * returned (the `id` tiebreak makes the order a total order so a same-`at` burst
   * never drops or repeats an entry across the boundary). Reads only day files that
   * exist (via {@link listDayFilesDesc}) and stops as soon as `limit + 1` matches
   * are collected, so a deep history costs at most one extra day-file read.
   */
  async page(opts: ActivityPageOptions = {}): Promise<ActivityPage> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const cursor = parseCursor(opts.before);
    const kinds = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : undefined;
    const days = await this.listDayFilesDesc();
    const collected: ActivityEntry[] = [];
    for (const day of days) {
      // A whole day newer than the cursor's day can hold nothing older than it.
      if (cursor && day > cursor.at.slice(0, 10)) continue;
      const dayEntries = (await this.readDay(day)).sort(byNewest);
      for (const entry of dayEntries) {
        if (cursor && !isOlderThanCursor(entry, cursor)) continue;
        if (kinds && !kinds.has(entry.kind)) continue;
        collected.push(entry);
        if (collected.length > limit) break;
      }
      if (collected.length > limit) break;
    }
    const hasMore = collected.length > limit;
    const entries = collected.slice(0, limit);
    const oldest = entries[entries.length - 1];
    const nextCursor = hasMore && oldest ? `${oldest.at}|${oldest.id}` : null;
    return { entries, nextCursor };
  }

  /** Existing `<YYYY-MM-DD>.jsonl` day files, newest-first — bounds the page scan. */
  private async listDayFilesDesc(): Promise<string[]> {
    const names = await fs.readdir(this.dir).catch(() => [] as string[]);
    return names
      .filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
      .map((n) => n.slice(0, 10))
      .sort((a, b) => b.localeCompare(a));
  }

  /**
   * Every entry recorded at or after `sinceIso`, newest-first — the briefing's
   * "what happened" window. Reads today + yesterday (a since cursor never reaches
   * further back than the morning automation cadence) and filters by `at`.
   */
  async readSince(sinceIso: string, now: Date = new Date()): Promise<ActivityEntry[]> {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const days = [YYYY_MM_DD(yesterday), YYYY_MM_DD(now)];
    const all: ActivityEntry[] = [];
    for (const day of days) all.push(...(await this.readDay(day)));
    return all.filter((e) => e.at >= sinceIso).sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * Every entry in the half-open window `[sinceDate, now)`, newest-first. Reads
   * every day file in range — intended for long-horizon consumers (e.g. the 30-day
   * pattern extractor) that need more history than `readSince`'s two-day window.
   */
  async readRange(sinceDate: Date, now: Date = new Date()): Promise<ActivityEntry[]> {
    const days: string[] = [];
    const cursor = new Date(sinceDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = YYYY_MM_DD(now);
    while (YYYY_MM_DD(cursor) <= end) {
      days.push(YYYY_MM_DD(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const all: ActivityEntry[] = [];
    for (const day of days) all.push(...(await this.readDay(day)));
    const sinceIso = sinceDate.toISOString();
    return all.filter((e) => e.at >= sinceIso).sort((a, b) => b.at.localeCompare(a.at));
  }

  private fileFor(date: string): string {
    return path.join(this.dir, `${date}.jsonl`);
  }

  /** Tolerant read of one day file: parse each line, skip garbage, never throw. */
  private async readDay(date: string): Promise<ActivityEntry[]> {
    const raw = await fs.readFile(this.fileFor(date), "utf8").catch(() => null);
    if (raw === null) return [];
    const out: ActivityEntry[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed = ActivityEntrySchema.safeParse(safeJson(line));
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }
}
