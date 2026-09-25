import { describe, expect, it } from "vitest";
import { formatWaited } from "./approval";

describe("formatWaited", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("renders minutes under an hour", () => {
    expect(formatWaited(new Date("2026-01-01T11:48:00.000Z").toISOString(), now)).toBe("12m");
  });

  it("renders hours under a day", () => {
    expect(formatWaited(new Date("2026-01-01T09:00:00.000Z").toISOString(), now)).toBe("3h");
  });

  it("renders days at and beyond a day", () => {
    expect(formatWaited(new Date("2025-12-30T12:00:00.000Z").toISOString(), now)).toBe("2d");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatWaited("not-a-date", now)).toBe("");
  });
});
