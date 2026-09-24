import { describe, expect, it } from "vitest";
import { FindingSnapshotSchema } from "../index";

describe("FindingSnapshotSchema", () => {
  it("accepts a snapshot with sorted fingerprints", () => {
    const parsed = FindingSnapshotSchema.safeParse({
      key: "sentinel",
      fingerprints: ["dep-owner/repo-1", "secret-proj_1-abc123"],
      updatedAt: "2026-07-17T05:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty fingerprint list (green run)", () => {
    expect(
      FindingSnapshotSchema.safeParse({
        key: "loom",
        fingerprints: [],
        updatedAt: "2026-07-17T02:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty key", () => {
    expect(
      FindingSnapshotSchema.safeParse({
        key: "",
        fingerprints: [],
        updatedAt: "2026-07-17T02:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
