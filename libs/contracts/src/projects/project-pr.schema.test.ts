import { describe, expect, it } from "vitest";
import { MergeProjectPrResultSchema } from "./project-pr.schema";

describe("MergeProjectPrResultSchema (NS2 F7b-2 — sha strictly additive)", () => {
  it("accepts a merge result carrying the merged sha", () => {
    const parsed = MergeProjectPrResultSchema.safeParse({
      merged: true,
      url: "https://github.com/acme/app/pull/42",
      sha: "abc123",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.sha).toBe("abc123");
  });

  it("omitting sha entirely still parses (the pre-F7b-2 result shape)", () => {
    const parsed = MergeProjectPrResultSchema.safeParse({
      merged: true,
      url: "https://github.com/acme/app/pull/42",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.sha).toBeUndefined();
  });

  it("a bare merged:false result (no url, no sha) still parses", () => {
    expect(MergeProjectPrResultSchema.safeParse({ merged: false }).success).toBe(true);
  });
});
