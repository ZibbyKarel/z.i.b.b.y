import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, Logger } from "@nestjs/common"
import {
  type ActivityEntry,
  ActivityEntrySchema,
  type ActivityKind,
  type ActivityRefs,
} from "@zibby/contracts"
import { collisionResistantId, ensureDir, safeJson } from "../shared/file-storage"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { ActivityEventsService } from "./activity-events.service"

/** DI token for the directory holding the append-only `<date>.jsonl` activity logs. */
export const ACTIVITY_DIR = "ACTIVITY_DIR"

/** What an emission site supplies; id/at/trace are stamped by {@link record}. */
export interface ActivityInput {
  kind: ActivityKind
  summary: string
  refs?: ActivityRefs
}

/** Options for {@link ActivityLogService.list}. */
export interface ActivityListOptions {
  /** `YYYY-MM-DD`; defaults to today (derived from `now`). */
  date?: string
  /** Restrict to these kinds. */
  kinds?: ActivityKind[]
  /** Newest-first cap (the controller defaults this to 50). */
  limit?: number
}

const YYYY_MM_DD = (d: Date): string => d.toISOString().slice(0, 10)

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
  private readonly logger = new Logger(ActivityLogService.name)

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
      const snap = this.trace.snapshot()
      const entry: ActivityEntry = ActivityEntrySchema.parse({
        id: collisionResistantId("act"),
        at: now.toISOString(),
        kind: input.kind,
        summary: input.summary,
        ...(snap.traceId ? { traceId: snap.traceId } : {}),
        ...(snap.runId ? { runId: snap.runId } : {}),
        refs: input.refs ?? {},
      })
      await ensureDir(this.dir)
      await fs.appendFile(this.fileFor(entry.at.slice(0, 10)), `${JSON.stringify(entry)}\n`, "utf8")
      this.events.emit({ kind: entry.kind, at: entry.at })
    } catch (error) {
      this.logger.warn(`activity record dropped (${input.kind}): ${String(error)}`)
    }
  }

  /** Read one day's entries, newest-first, optionally filtered by kind and capped. */
  async list(opts: ActivityListOptions = {}, now: Date = new Date()): Promise<ActivityEntry[]> {
    const date = opts.date ?? YYYY_MM_DD(now)
    let entries = (await this.readDay(date)).reverse()
    if (opts.kinds && opts.kinds.length > 0) {
      const set = new Set(opts.kinds)
      entries = entries.filter((e) => set.has(e.kind))
    }
    return opts.limit !== undefined ? entries.slice(0, opts.limit) : entries
  }

  /**
   * Every entry recorded at or after `sinceIso`, newest-first — the briefing's
   * "what happened" window. Reads today + yesterday (a since cursor never reaches
   * further back than the morning automation cadence) and filters by `at`.
   */
  async readSince(sinceIso: string, now: Date = new Date()): Promise<ActivityEntry[]> {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const days = [YYYY_MM_DD(yesterday), YYYY_MM_DD(now)]
    const all: ActivityEntry[] = []
    for (const day of days) all.push(...(await this.readDay(day)))
    return all
      .filter((e) => e.at >= sinceIso)
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  private fileFor(date: string): string {
    return path.join(this.dir, `${date}.jsonl`)
  }

  /** Tolerant read of one day file: parse each line, skip garbage, never throw. */
  private async readDay(date: string): Promise<ActivityEntry[]> {
    const raw = await fs.readFile(this.fileFor(date), "utf8").catch(() => null)
    if (raw === null) return []
    const out: ActivityEntry[] = []
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue
      const parsed = ActivityEntrySchema.safeParse(safeJson(line))
      if (parsed.success) out.push(parsed.data)
    }
    return out
  }
}
