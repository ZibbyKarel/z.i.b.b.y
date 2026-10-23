import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  clockTime,
  compactAgo,
  formatCountdown,
  formatDuration,
  relativeTime,
} from "./time";

const T0 = Date.parse("2026-06-10T12:00:00Z");
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();
const en = (n: number, unit: string) => (n === 0 ? "just now" : `${n} ${unit} ago`);

describe("relativeTime", () => {
  it("renders sub-minute differences as the zero phrase", () => {
    expect(relativeTime(iso(30_000), T0, en)).toBe("just now");
  });

  it("renders minutes under an hour", () => {
    expect(relativeTime(iso(3 * 60_000), T0, en)).toBe("3 m ago");
    expect(relativeTime(iso(59 * 60_000), T0, en)).toBe("59 m ago");
  });

  it("renders whole hours from an hour up", () => {
    expect(relativeTime(iso(60 * 60_000), T0, en)).toBe("1 h ago");
    expect(relativeTime(iso(26 * 60 * 60_000), T0, en)).toBe("26 h ago");
  });

  it("clamps future timestamps to the zero phrase", () => {
    expect(relativeTime(iso(-5 * 60_000), T0, en)).toBe("just now");
  });
});

describe("compactAgo", () => {
  it("renders now / minutes / hours compactly", () => {
    expect(compactAgo(iso(10_000), T0)).toBe("now");
    expect(compactAgo(iso(3 * 60_000), T0)).toBe("3m");
    expect(compactAgo(iso(2 * 60 * 60_000), T0)).toBe("2h");
  });
});

describe("clockTime", () => {
  it("formats the wall-clock time in the viewer's local timezone, not UTC", () => {
    const at = "2026-06-10T10:03:00Z";
    const expected = new Date(Date.parse(at)).toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(clockTime(at, "en")).toBe(expected);
    // Regression guard: the old bug sliced "HH:MM" straight out of the UTC ISO
    // string, so it would equal "10:03" regardless of the viewer's timezone.
    // Assert we're not doing that (this only fails to guard in a UTC CI runner,
    // where local time legitimately equals the UTC slice).
    if (new Date().getTimezoneOffset() !== 0) {
      expect(clockTime(at, "en")).not.toBe("10:03");
    }
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(clockTime("not-a-date", "en")).toBe("");
  });
});

describe("formatDuration", () => {
  it("renders sub-minute spans as seconds only", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("renders minutes plus remaining seconds under an hour", () => {
    expect(formatDuration(3 * 60_000 + 12_000)).toBe("3m 12s");
    expect(formatDuration(59 * 60_000)).toBe("59m 0s");
  });

  it("renders hours plus remaining minutes from an hour up", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h 0m");
    expect(formatDuration(2 * 60 * 60_000 + 5 * 60_000)).toBe("2h 5m");
  });

  it("clamps a negative or non-finite span to 0s", () => {
    expect(formatDuration(-1000)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
  });
});

describe("formatCountdown", () => {
  it("reads days+hours, hours+minutes, then minutes", () => {
    expect(formatCountdown(3 * DAY_MS + 6 * HOUR_MS + 5 * MINUTE_MS)).toBe("3d 6h");
    expect(formatCountdown(2 * HOUR_MS + 22 * MINUTE_MS)).toBe("2h 22m");
    expect(formatCountdown(41 * MINUTE_MS + 10_000)).toBe("41m");
    expect(formatCountdown(20_000)).toBe("1m");
  });

  it("reads 'now' for a past or invalid span", () => {
    expect(formatCountdown(0)).toBe("now");
    expect(formatCountdown(-5)).toBe("now");
    expect(formatCountdown(Number.NaN)).toBe("now");
  });
});
