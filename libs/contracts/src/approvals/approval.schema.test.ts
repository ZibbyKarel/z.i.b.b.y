import { describe, expect, it } from "vitest";
import { AnswerApprovalSchema, OPERATOR_QUESTION_ACTION } from "./approval.schema";

describe("operator question", () => {
  it("AnswerApprovalSchema rejects blank and trims", () => {
    expect(AnswerApprovalSchema.safeParse({ answer: " " }).success).toBe(false);
    expect(AnswerApprovalSchema.parse({ answer: " yes " }).answer).toBe("yes");
  });

  it("exposes the action constant", () => {
    expect(OPERATOR_QUESTION_ACTION).toBe("operator.question");
  });
});
