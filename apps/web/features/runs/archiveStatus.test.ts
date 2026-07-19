import { describe, expect, it } from "vitest";
import type { FeedStatus } from "./run";
import { ARCHIVED_STATES, isArchived } from "./archiveStatus";

describe("archiveStatus", () => {
  it("archives done/error/interrupted/parked", () => {
    expect(isArchived("done")).toBe(true);
    expect(isArchived("error")).toBe(true);
    expect(isArchived("interrupted")).toBe(true);
    expect(isArchived("parked")).toBe(true);
  });

  it("keeps paused-limit OUT of the archive — a mid-run pause that auto-resumes, not a failure", () => {
    expect(isArchived("paused-limit")).toBe(false);
  });

  it("keeps every live/waiting state out of the archive", () => {
    const active: FeedStatus[] = [
      "running",
      "pending",
      "awaiting-approval",
      "scheduled",
      "held",
      "queued",
    ];
    for (const status of active) expect(isArchived(status)).toBe(false);
  });

  it("is exactly the four-state set — no silent drift", () => {
    expect(ARCHIVED_STATES).toEqual(
      new Set<FeedStatus>(["done", "error", "interrupted", "parked"]),
    );
  });
});
