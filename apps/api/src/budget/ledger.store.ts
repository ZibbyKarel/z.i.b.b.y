import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { ensureDir, isErrnoException, safeJson } from "../shared/file-storage";

/** DI token for the directory holding the append-only `<date>.jsonl` dispatch ledger. */
export const BUDGET_LEDGER_DIR = "BUDGET_LEDGER_DIR";

/** Timezone the budget windows are cut on — the scheduler's cron timezone precedent. */
export const BUDGET_TZ = "Europe/Prague";

/**
 * One ledger line. Two shapes share the same file (decision 2, Phase 12):
 * - A *dispatch* line (`type` absent — every pre-Phase-12 line, and every new
 *   started-run line): counted by {@link BudgetLedgerStore.countDaily}/`countWeekly`/
 *   `countMonthly` toward the run-count caps.
 * - A *cost* line (`type: "cost"`, `costUsd` set): appended once a run finishes with
 *   a known price (task-scheduler's `reconcileOutcome`); excluded from the run-count
 *   methods, summed by `sumCostDaily`/`sumCostWeekly`/`sumCostMonthly` toward the
 *   dollar caps. Never migrated — old files simply have no cost lines.
 */
export interface LedgerEntry {
  at: string;
  projectId?: string;
  taskId?: string;
  runRef: string;
  /** The routed target kind ("agent" | "pipeline" | "orchestrator"). */
  kind: string;
  /** "dispatch" (the default — absent on every line before Phase 12) or "cost". */
  type?: "dispatch" | "cost";
  /** USD cost of the finished run. Set only on `type: "cost"` lines. */
  costUsd?: number;
}

/** Sum + count of cost lines in a window — count is the average's denominator. */
export interface CostWindowStats {
  /** Total `costUsd` across the window's cost lines. */
  sum: number;
  /** How many cost lines contributed to `sum` (0 → no cost data yet in the window). */
  count: number;
}

/** Thrown when the ledger dir cannot be read (NOT a missing day file) — fail-closed signal. */
export class LedgerUnreadableError extends Error {
  constructor(cause: unknown) {
    super(`budget ledger unreadable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "LedgerUnreadableError";
  }
}

/**
 * The dispatch ledger (Phase 8.1) — ENFORCEMENT data, deliberately separate from the
 * accountability activity log (whose `record` is best-effort/void). One
 * `<YYYY-MM-DD>.jsonl` per day under {@link BUDGET_LEDGER_DIR}, one
 * `JSON.stringify(entry) + "\n"` per `fs.appendFile` (O_APPEND, the activity-log
 * mechanics), where the date is the **Europe/Prague** calendar day at append time so
 * a window is exactly a set of day-file names. Counting = read the window's files and
 * filter by projectId.
 *
 * Reads are tolerant per line; a missing day file is 0 (no spend yet). A genuinely
 * unreadable dir throws {@link LedgerUnreadableError} so the budget service can
 * fail-closed (decision 6) — distinct from "fresh install, nothing dispatched".
 */
@Injectable()
export class BudgetLedgerStore {
  constructor(@Inject(BUDGET_LEDGER_DIR) private readonly dir: string) {}

  /** Append one started-run line (awaited on the dispatch path — enforcement data). */
  async record(entry: LedgerEntry, now: Date = new Date()): Promise<void> {
    await this.append(entry, now);
  }

  /**
   * Append one finished-run cost line (Phase 12) — `type: "cost"`, excluded from
   * the run-count methods. The caller (task-scheduler's `reconcileOutcome`) awaits
   * this but treats a failure as best-effort (logs, does not fail the reconcile).
   */
  async recordCost(
    entry: Omit<LedgerEntry, "type" | "costUsd"> & { costUsd: number },
    now: Date = new Date(),
  ): Promise<void> {
    await this.append({ ...entry, type: "cost" }, now);
  }

  private async append(entry: LedgerEntry, now: Date): Promise<void> {
    await ensureDir(this.dir);
    const file = this.fileFor(pragueDate(now));
    await fs.appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  }

  /** Runs counted for `projectId` on the Prague day containing `now`. */
  async countDaily(projectId: string, now: Date = new Date()): Promise<number> {
    return this.countAcross([pragueDate(now)], projectId);
  }

  /** Runs counted for `projectId` across the current ISO week (Mon..now), Prague. */
  async countWeekly(projectId: string, now: Date = new Date()): Promise<number> {
    return this.countAcross(isoWeekDates(pragueDate(now)), projectId);
  }

  /** Runs counted for `projectId` month-to-date (1st..now of the Prague month). */
  async countMonthly(projectId: string, now: Date = new Date()): Promise<number> {
    return this.countAcross(monthDates(pragueDate(now)), projectId);
  }

  /** Cost-line sum + count for `projectId` on the Prague day containing `now`. */
  async sumCostDaily(projectId: string, now: Date = new Date()): Promise<CostWindowStats> {
    return this.costStatsAcross([pragueDate(now)], projectId);
  }

  /** Cost-line sum + count for `projectId` across the current ISO week, Prague. */
  async sumCostWeekly(projectId: string, now: Date = new Date()): Promise<CostWindowStats> {
    return this.costStatsAcross(isoWeekDates(pragueDate(now)), projectId);
  }

  /** Cost-line sum + count for `projectId` month-to-date, Prague. */
  async sumCostMonthly(projectId: string, now: Date = new Date()): Promise<CostWindowStats> {
    return this.costStatsAcross(monthDates(pragueDate(now)), projectId);
  }

  /** Count matching *dispatch* lines across the given day-file names (cost lines excluded). */
  private async countAcross(dates: string[], projectId: string): Promise<number> {
    let total = 0;
    for (const date of dates) {
      for (const entry of await this.readDay(date)) {
        if (entry.type === "cost") continue;
        if (entry.projectId === projectId) total += 1;
      }
    }
    return total;
  }

  /** Sum + count matching *cost* lines across the given day-file names. */
  private async costStatsAcross(dates: string[], projectId: string): Promise<CostWindowStats> {
    let sum = 0;
    let count = 0;
    for (const date of dates) {
      for (const entry of await this.readDay(date)) {
        if (entry.type === "cost" && entry.projectId === projectId) {
          sum += entry.costUsd ?? 0;
          count += 1;
        }
      }
    }
    return { sum, count };
  }

  /** Tolerant read of one day file. ENOENT → []; any other error → fail-closed throw. */
  private async readDay(date: string): Promise<LedgerEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.fileFor(date), "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return [];
      throw new LedgerUnreadableError(error);
    }
    const out: LedgerEntry[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim().length === 0) continue;
      const parsed = safeJson(line);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as LedgerEntry).runRef === "string"
      ) {
        out.push(parsed as LedgerEntry);
      }
    }
    return out;
  }

  private fileFor(date: string): string {
    return path.join(this.dir, `${date}.jsonl`);
  }
}

/** The Europe/Prague calendar date (YYYY-MM-DD) for an instant. */
export function pragueDate(now: Date): string {
  // en-CA renders ISO-shaped YYYY-MM-DD; the timeZone does the local-day cut.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUDGET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The YYYY-MM-DD day-file names of the calendar month containing `date`, from the
 * 1st through `date` inclusive. Built off the already-Prague-local date string, so
 * the month boundary is the Prague month (same precedent as {@link isoWeekDates}).
 */
export function monthDates(date: string): string[] {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const dates: string[] = [];
  for (let d = 1; d <= day; d++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

/**
 * The YYYY-MM-DD day-file names of the ISO week (Monday-start) that contains
 * `date`, from Monday through `date` inclusive. Date arithmetic is done on the
 * calendar date as a UTC midnight — timezone-safe because the input is already the
 * Prague-local date string.
 */
export function isoWeekDates(date: string): string[] {
  const d = new Date(`${date}T00:00:00.000Z`);
  // getUTCDay: 0=Sun..6=Sat → days since Monday.
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  const dates: string[] = [];
  for (let i = sinceMonday; i >= 0; i--) {
    const day = new Date(d.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}
