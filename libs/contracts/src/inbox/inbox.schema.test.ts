import { describe, expect, it } from "vitest";
import { PR_REVIEW_LEVELS, ReviewInboxPrInputSchema } from "./inbox.schema";

const base = { projectId: "acme", repo: "acme/app", number: 7 };

describe("ReviewInboxPrInputSchema level (todo-4)", () => {
  it("lists the three levels, quick first (the default)", () => {
    expect(PR_REVIEW_LEVELS).toEqual(["quick", "thorough", "tested"]);
  });

  it("accepts every level and an omitted level", () => {
    for (const level of PR_REVIEW_LEVELS) {
      expect(ReviewInboxPrInputSchema.parse({ ...base, level }).level).toBe(level);
    }
    expect(ReviewInboxPrInputSchema.parse(base).level).toBeUndefined();
  });

  it("rejects an unknown level", () => {
    expect(ReviewInboxPrInputSchema.safeParse({ ...base, level: "deep" }).success).toBe(false);
  });
});
