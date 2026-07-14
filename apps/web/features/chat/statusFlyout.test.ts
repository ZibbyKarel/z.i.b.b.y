import { describe, expect, it } from "vitest";
import { CLOSE_GRACE_MS, SECTION_META, WORKING_STATUSES, formatRelativeTime } from "./statusFlyout";

describe("statusFlyout constants", () => {
  it("keeps the design widths and the 200ms grace", () => {
    expect(SECTION_META.working.width).toBe(640);
    expect(SECTION_META.waiting.width).toBe(720);
    expect(CLOSE_GRACE_MS).toBe(200);
  });

  it("counts running and spawning-pending runs as working", () => {
    expect(WORKING_STATUSES.has("running")).toBe(true);
    expect(WORKING_STATUSES.has("pending")).toBe(true);
    expect(WORKING_STATUSES.has("awaiting-approval")).toBe(false);
    expect(WORKING_STATUSES.has("done")).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("formats a recent start relative to now", () => {
    expect(formatRelativeTime("2026-07-14T11:57:00Z", "en", now)).toBe("3 minutes ago");
  });

  it("degrades to an empty string on an unparsable date", () => {
    expect(formatRelativeTime("not-a-date", "en", now)).toBe("");
  });
});
