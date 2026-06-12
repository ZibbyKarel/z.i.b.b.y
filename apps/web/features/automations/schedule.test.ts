import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE,
  cronToSchedule,
  dayName,
  describeCron,
  matchesCron,
  nextCronRun,
  relativeLabel,
  scheduleToCron,
} from "./schedule";

describe("describeCron", () => {
  it("reads the common shapes into structured descriptors", () => {
    expect(describeCron("* * * * *")).toEqual({ kind: "everyMinute" });
    expect(describeCron("*/5 * * * *")).toEqual({ kind: "everyMinutes", n: 5 });
    expect(describeCron("0 * * * *")).toEqual({ kind: "hourly" });
    expect(describeCron("30 * * * *")).toEqual({ kind: "hourlyAt", minute: 30 });
    expect(describeCron("0 */2 * * *")).toEqual({ kind: "everyHours", n: 2 });
    expect(describeCron("0 7 * * *")).toEqual({ kind: "daily", time: "07:00" });
    expect(describeCron("30 8 * * 1-5")).toEqual({ kind: "weekdays", time: "08:30" });
    expect(describeCron("0 12 * * 0,6")).toEqual({ kind: "weekends", time: "12:00" });
    expect(describeCron("15 10 * * 1")).toEqual({ kind: "weekday", day: 1, time: "10:15" });
    expect(describeCron("0 7 * * 1,3,5")).toEqual({ kind: "days", days: [1, 3, 5], time: "07:00" });
    expect(describeCron("0 7 * * 1,2,3")).toEqual({ kind: "days", days: [1, 2, 3], time: "07:00" });
    expect(describeCron("0 7 * * 2-4")).toEqual({ kind: "days", days: [2, 3, 4], time: "07:00" });
    expect(describeCron("0 2 1 * *")).toEqual({ kind: "monthly", day: 1, time: "02:00" });
  });

  it("falls back to raw for shapes it does not recognize", () => {
    expect(describeCron("0 0 1 1 *")).toEqual({ kind: "raw", expr: "0 0 1 1 *" });
    expect(describeCron("0 7 * * 1,9")).toEqual({ kind: "raw", expr: "0 7 * * 1,9" });
    expect(describeCron("not a cron")).toEqual({ kind: "raw", expr: "not a cron" });
  });
});

describe("cronToSchedule", () => {
  it("reads the friendly shapes into a Schedule", () => {
    expect(cronToSchedule("0 7 * * *")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], time: "07:00" });
    expect(cronToSchedule("30 8 * * 1-5")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [1, 2, 3, 4, 5], time: "08:30" });
    expect(cronToSchedule("0 12 * * 0,6")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 6], time: "12:00" });
    expect(cronToSchedule("15 10 * * 5")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [5], time: "10:15" });
    expect(cronToSchedule("0 7 * * 1,3,5")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [1, 3, 5], time: "07:00" });
    expect(cronToSchedule("0 2 15 * *")).toEqual({ ...DEFAULT_SCHEDULE, repeat: "monthly", monthDay: 15, time: "02:00" });
  });

  it("returns null for expressions the picker cannot represent", () => {
    expect(cronToSchedule("*/5 * * * *")).toBeNull();
    expect(cronToSchedule("0 * * * *")).toBeNull();
    expect(cronToSchedule("not a cron")).toBeNull();
  });
});

describe("scheduleToCron", () => {
  it("renders each cadence to cron", () => {
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], time: "07:00" })).toBe("0 7 * * *");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [1, 2, 3, 4, 5], time: "08:30" })).toBe("30 8 * * 1-5");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 6], time: "12:00" })).toBe("0 12 * * 0,6");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [5], time: "07:00" })).toBe("0 7 * * 5");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [1, 3, 5], time: "07:00" })).toBe("0 7 * * 1,3,5");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "monthly", monthDay: 15, time: "02:00" })).toBe("0 2 15 * *");
  });

  it("collapses an empty or full weekday set to every day", () => {
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [], time: "07:00" })).toBe("0 7 * * *");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], time: "07:00" })).toBe("0 7 * * *");
  });

  it("normalizes unsorted or duplicated weekdays", () => {
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [5, 1, 3, 1], time: "07:00" })).toBe("0 7 * * 1,3,5");
  });

  it("clamps out-of-range time and day fields", () => {
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6], time: "99:99" })).toBe("59 23 * * *");
    expect(scheduleToCron({ ...DEFAULT_SCHEDULE, repeat: "monthly", monthDay: 40, time: "00:00" })).toBe("0 0 31 * *");
  });

  it("round-trips every representable cron through a Schedule", () => {
    for (const expr of ["0 7 * * *", "30 8 * * 1-5", "0 12 * * 0,6", "15 10 * * 5", "0 7 * * 1,3,5", "0 2 15 * *"]) {
      const schedule = cronToSchedule(expr);
      expect(schedule).not.toBeNull();
      expect(scheduleToCron(schedule!)).toBe(expr);
    }
  });
});

describe("nextCronRun", () => {
  it("returns the next instant the expression fires, in the future", () => {
    const from = new Date("2026-06-12T09:00:00.000Z");
    const next = nextCronRun("0 7 * * *", from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
    expect(matchesCron("0 7 * * *", next!)).toBe(true);
  });

  it("returns null for an unparseable expression", () => {
    expect(nextCronRun("nope", new Date())).toBeNull();
  });
});

describe("dayName", () => {
  it("maps cron day-of-week indices to localized names (0 = Sunday)", () => {
    expect(dayName(0, "en")).toBe("Sunday");
    expect(dayName(1, "en")).toBe("Monday");
    expect(dayName(6, "en")).toBe("Saturday");
  });
});

describe("relativeLabel", () => {
  it("renders a localized past phrase", () => {
    const now = Date.parse("2026-06-12T12:00:00.000Z");
    expect(relativeLabel(now - 5 * 60_000, now, "en")).toMatch(/5/);
  });

  it("renders a localized future phrase", () => {
    const now = Date.parse("2026-06-12T12:00:00.000Z");
    expect(relativeLabel(now + 2 * 60 * 60_000, now, "en")).toMatch(/2/);
  });
});
