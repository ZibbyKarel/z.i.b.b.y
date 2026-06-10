import { describe, expect, it } from "vitest";
import { compactAgo, relativeTime } from "./time";

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
