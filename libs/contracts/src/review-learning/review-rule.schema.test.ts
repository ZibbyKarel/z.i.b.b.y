import { describe, expect, it } from "vitest";
import { ApprovalRunKindSchema } from "../approvals/approval.schema";
import { TargetSchema } from "../automations/automation.schema";
import { ReviewRuleSchema, ReviewRulesFileSchema } from "./review-rule.schema";

const OCCURRENCE = {
  commentId: "rc-12345",
  prUrl: "https://github.com/acme/app/pull/7",
  commentUrl: "https://github.com/acme/app/pull/7#discussion_r12345",
  author: "zibbykarel",
  at: "2026-07-29T10:00:00.000Z",
  excerpt: "tohle patří do design systemu, ne do apps/web",
};

const RULE = {
  id: "no-local-primitives",
  scope: "project",
  rule: "Primitivy ber z libs/design-system, nepiš je v apps/web.",
  rationale: "Opakovaná výtka v review.",
  status: "observed",
  occurrences: [OCCURRENCE],
  createdAt: "2026-07-29T10:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
};

describe("ReviewRuleSchema", () => {
  it("accepts a minimal observed rule", () => {
    expect(ReviewRuleSchema.parse(RULE)).toEqual(RULE);
  });

  it("rejects an id that is not a kebab slug", () => {
    expect(ReviewRuleSchema.safeParse({ ...RULE, id: "No Local Primitives" }).success).toBe(false);
  });

  it("rejects a rule sentence over 160 chars", () => {
    expect(ReviewRuleSchema.safeParse({ ...RULE, rule: "x".repeat(161) }).success).toBe(false);
  });

  it("rejects a rule with no occurrences", () => {
    expect(ReviewRuleSchema.safeParse({ ...RULE, occurrences: [] }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(ReviewRuleSchema.safeParse({ ...RULE, status: "maybe" }).success).toBe(false);
  });
});

describe("ReviewRulesFileSchema", () => {
  it("defaults to an empty rule list and no cursor", () => {
    expect(ReviewRulesFileSchema.parse({})).toEqual({ rules: [] });
  });

  it("round-trips a cursor", () => {
    const file = { rules: [RULE], cursor: "2026-07-29T10:00:00.000Z" };
    expect(ReviewRulesFileSchema.parse(file)).toEqual(file);
  });
});

describe("enum extensions", () => {
  it("accepts the review-rule approval kind", () => {
    expect(ApprovalRunKindSchema.safeParse("review-rule").success).toBe(true);
  });

  it("accepts the review-learn automation target", () => {
    expect(TargetSchema.safeParse({ type: "review-learn" }).success).toBe(true);
  });
});
