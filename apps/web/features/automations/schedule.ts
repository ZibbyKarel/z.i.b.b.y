/**
 * Client-side schedule helpers for the automations screen. Three concerns:
 *
 *  - {@link describeCron} turns a 5-field cron expression into a structured,
 *    human-readable descriptor (formatted to a localized string by `useCronLabel`).
 *  - {@link nextCronRun} forward-scans for the next fire instant.
 *  - {@link relativeLabel} renders a localized "5 min ago" / "in 2 hr" phrase.
 *
 * The matcher mirrors `apps/api/src/automations/cron.ts` and is evaluated in
 * `Europe/Prague`, so what the UI shows matches when the backend scheduler fires.
 * The duplication is deliberate: the two apps don't share a runtime, and this is a
 * tiny, well-tested pure function.
 */

import type { Schedule } from "@zibby/design-system";

export const SCHEDULE_TIME_ZONE = "Europe/Prague";

const MINUTE_MS = 60_000;

const FIELD_BOUNDS: ReadonlyArray<readonly [min: number, max: number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

// ---- cron matcher (ported from the API daemon) --------------------------

/** Does `date` (in `timeZone`) satisfy the 5-field cron `expr`? */
export function matchesCron(expr: string, date: Date, timeZone = SCHEDULE_TIME_ZONE): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const parts = zonedParts(date, timeZone);
  const values = [parts.minute, parts.hour, parts.day, parts.month, parts.weekday];
  for (let i = 0; i < 5; i++) {
    const field = fields[i];
    const value = values[i];
    const bounds = FIELD_BOUNDS[i];
    if (field === undefined || value === undefined || bounds === undefined) return false;
    if (!matchField(field, value, bounds)) return false;
  }
  return true;
}

function matchField(field: string, value: number, [lo, hi]: readonly [number, number]): boolean {
  return field.split(",").some((part) => matchAtom(part, value, lo, hi));
}

function matchAtom(part: string, value: number, lo: number, hi: number): boolean {
  let step = 1;
  let range = part;
  const slash = part.indexOf("/");
  if (slash >= 0) {
    step = Number(part.slice(slash + 1));
    range = part.slice(0, slash);
    if (!Number.isInteger(step) || step < 1) return false;
  }
  let start = lo;
  let end = hi;
  if (range !== "*") {
    const dash = range.indexOf("-");
    if (dash >= 0) {
      start = Number(range.slice(0, dash));
      end = Number(range.slice(dash + 1));
    } else {
      start = end = Number(range);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  }
  if (value < start || value > end) return false;
  return (value - start) % step === 0;
}

interface ZonedParts {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
}

/** The wall-clock fields of `date` in `timeZone`. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    minute: "2-digit",
    hour: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
  const lookup: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) lookup[p.type] = p.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minute: Number(lookup.minute),
    hour: Number(lookup.hour) % 24,
    day: Number(lookup.day),
    month: Number(lookup.month),
    weekday: Math.max(0, weekdays.indexOf(lookup.weekday ?? "Sun")),
  };
}

/**
 * The next instant at or after `from` that `expr` fires, or `null` if none falls
 * within a year (a guard against expressions that can never match). Scans whole
 * minutes — cheap arithmetic, and callers memoize per expression.
 */
export function nextCronRun(expr: string, from: Date): Date | null {
  if (expr.trim().split(/\s+/).length !== 5) return null;
  const start = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const candidate = new Date(start + i * MINUTE_MS);
    if (matchesCron(expr, candidate)) return candidate;
  }
  return null;
}

// ---- human-readable schedule descriptor ---------------------------------

/** A structured reading of a cron expression; `useCronLabel` formats it via i18n. */
export type CronDescriptor =
  | { kind: "everyMinute" }
  | { kind: "everyMinutes"; n: number }
  | { kind: "hourly" }
  | { kind: "hourlyAt"; minute: number }
  | { kind: "everyHours"; n: number }
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekends"; time: string }
  | { kind: "weekday"; day: number; time: string }
  | { kind: "days"; days: number[]; time: string }
  | { kind: "monthly"; day: number; time: string }
  | { kind: "raw"; expr: string };

const isNum = (value: string): boolean => /^\d+$/.test(value);
const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Parse a `*​/n` step atom into `n`, else `null`. */
function stepEvery(value: string): number | null {
  const match = /^\*\/(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

/** "HH:MM" when both minute and hour are single concrete values, else `null`. */
function concreteTime(min: string, hour: string): string | null {
  if (!isNum(min) || !isNum(hour)) return null;
  return `${pad2(Number(hour))}:${pad2(Number(min))}`;
}

/**
 * Read the common cron shapes into a descriptor; anything we don't recognize
 * falls back to `{ kind: "raw" }` so the screen shows the expression verbatim
 * rather than a wrong paraphrase.
 */
export function describeCron(expr: string): CronDescriptor {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return { kind: "raw", expr };
  const [min, hour, dom, mon, dow] = fields as [string, string, string, string, string];
  const everyDate = dom === "*" && mon === "*";

  if (min === "*" && hour === "*" && everyDate && dow === "*") return { kind: "everyMinute" };

  const stepMin = stepEvery(min);
  if (stepMin && hour === "*" && everyDate && dow === "*") {
    return { kind: "everyMinutes", n: stepMin };
  }

  if (isNum(min) && hour === "*" && everyDate && dow === "*") {
    const minute = Number(min);
    return minute === 0 ? { kind: "hourly" } : { kind: "hourlyAt", minute };
  }

  const stepHour = stepEvery(hour);
  if (isNum(min) && stepHour && everyDate && dow === "*") {
    return { kind: "everyHours", n: stepHour };
  }

  const time = concreteTime(min, hour);
  if (time) {
    if (everyDate) {
      if (dow === "*") return { kind: "daily", time };
      if (dow === "1-5") return { kind: "weekdays", time };
      if (dow === "0,6" || dow === "6,0") return { kind: "weekends", time };
      if (isNum(dow)) return { kind: "weekday", day: Number(dow), time };
      const days = parseWeekdays(dow);
      if (days) return { kind: "days", days, time };
    } else if (dow === "*" && mon === "*" && isNum(dom)) {
      return { kind: "monthly", day: Number(dom), time };
    }
  }

  return { kind: "raw", expr };
}

// ---- friendly schedule ⇄ cron ------------------------------------------

/** Every weekday selected (0 = Sunday … 6 = Saturday) — i.e. "every day". */
const ALL_WEEKDAYS: ReadonlyArray<number> = [0, 1, 2, 3, 4, 5, 6];

/** The schedule a fresh automation starts on — every friendly default lives here. */
export const DEFAULT_SCHEDULE: Schedule = {
  repeat: "weekly",
  time: "07:00",
  weekdays: [...ALL_WEEKDAYS],
  monthDay: 1,
};

/**
 * Read a cron expression into the `Schedule` the friendly picker speaks, or
 * `null` when the expression is outside what the picker can represent (every-N,
 * hourly, raw). Callers fall back to {@link DEFAULT_SCHEDULE} so an advanced
 * expression is never silently misread as a wrong friendly one. A plain daily
 * cron reads back as a weekly schedule with every day selected.
 */
export function cronToSchedule(expr: string): Schedule | null {
  const desc = describeCron(expr);
  switch (desc.kind) {
    case "daily":
      return { ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [...ALL_WEEKDAYS], time: desc.time };
    case "weekdays":
      return { ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [1, 2, 3, 4, 5], time: desc.time };
    case "weekends":
      return { ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 6], time: desc.time };
    case "weekday":
      return { ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [desc.day], time: desc.time };
    case "days":
      return { ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: desc.days, time: desc.time };
    case "monthly":
      return { ...DEFAULT_SCHEDULE, repeat: "monthly", monthDay: desc.day, time: desc.time };
    default:
      return null;
  }
}

/** Render a friendly `Schedule` to a 5-field cron expression. */
export function scheduleToCron(s: Schedule): string {
  const [hour, minute] = splitTime(s.time);
  if (s.repeat === "monthly") {
    return `${minute} ${hour} ${clamp(s.monthDay, 1, 31)} * *`;
  }
  return `${minute} ${hour} * * ${weekdaysAtom(s.weekdays)}`;
}

/**
 * Render selected weekdays to the day-of-week cron atom. Empty or all-seven
 * collapses to `*` (every day); the two contiguous commuter sets keep their
 * tidy forms (`1-5`, `0,6`) so they round-trip through the nicer descriptors;
 * everything else is a sorted comma list (`1,3,5`).
 */
function weekdaysAtom(weekdays: number[]): string {
  const days = normalizeWeekdays(weekdays);
  if (days.length === 0 || days.length === 7) return "*";
  if (sameDays(days, [1, 2, 3, 4, 5])) return "1-5";
  if (sameDays(days, [0, 6])) return "0,6";
  return days.join(",");
}

/** Sorted, de-duplicated weekday indices, each constrained to 0–6. */
function normalizeWeekdays(weekdays: number[]): number[] {
  const set = new Set<number>();
  for (const day of weekdays) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) set.add(day);
  }
  return [...set].sort((a, b) => a - b);
}

function sameDays(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((day, i) => day === b[i]);
}

/**
 * Parse a day-of-week cron atom (comma list and/or `a-b` ranges of concrete
 * days) into sorted unique indices, or `null` for `*`, steps, or anything out
 * of range. The `*`, `1-5`, `0,6` and single-day shapes are handled earlier by
 * `describeCron`; this catches the remaining explicit sets like `1,3,5`.
 */
function parseWeekdays(atom: string): number[] | null {
  const days = new Set<number>();
  for (const part of atom.split(",")) {
    const dash = part.indexOf("-");
    if (dash >= 0) {
      const start = Number(part.slice(0, dash));
      const end = Number(part.slice(dash + 1));
      if (!isDay(start) || !isDay(end) || start > end) return null;
      for (let d = start; d <= end; d++) days.add(d);
    } else {
      if (!isNum(part)) return null;
      const d = Number(part);
      if (!isDay(d)) return null;
      days.add(d);
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

const isDay = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 6;

/** "HH:MM" → `[hour, minute]`, clamped to valid ranges (defaults to 00:00). */
function splitTime(time: string): [number, number] {
  const [h, m] = time.split(":");
  return [clamp(Number(h), 0, 23), clamp(Number(m), 0, 59)];
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

/** Localized weekday name for a cron day-of-week index (0 = Sunday). */
export function dayName(day: number, locale: string): string {
  return weekdayName(day, locale, "long");
}

/** Localized short weekday name for a cron day-of-week index (0 = Sunday). */
export function dayNameShort(day: number, locale: string): string {
  return weekdayName(day, locale, "short");
}

function weekdayName(day: number, locale: string, weekday: "long" | "short"): string {
  // 2024-08-04 (UTC) is a Sunday — offset by the cron index to land on the day.
  const date = new Date(Date.UTC(2024, 7, 4 + (((day % 7) + 7) % 7)));
  return new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" }).format(date);
}

// ---- relative time ------------------------------------------------------

/**
 * Localized relative phrase between `targetMs` and `nowMs` — past renders as
 * "5 min ago", future as "in 2 hr". Coarsens to minutes, then hours, then days,
 * leaning on `Intl.RelativeTimeFormat` for the wording in the active locale.
 */
export function relativeLabel(targetMs: number, nowMs: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const diffMs = targetMs - nowMs;
  const absMs = Math.abs(diffMs);
  if (absMs < HOUR_MS) return rtf.format(Math.round(diffMs / MINUTE_MS), "minute");
  if (absMs < DAY_MS) return rtf.format(Math.round(diffMs / HOUR_MS), "hour");
  return rtf.format(Math.round(diffMs / DAY_MS), "day");
}

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
