import { describe, expect, it } from "vitest";
import { EmptyBodySchema } from "../common.schema";
import { ApprovalSchema, approvalsContract } from "../index";

describe("approvalsContract", () => {
  it("exposes list/get/approve/reject under /api/approvals", () => {
    expect(approvalsContract.listPendingApprovals.path).toBe("/api/approvals");
    expect(approvalsContract.getApproval.path).toBe("/api/approvals/:id");
    expect(approvalsContract.approveApproval.path).toBe("/api/approvals/:id/approve");
    expect(approvalsContract.rejectApproval.path).toBe("/api/approvals/:id/reject");
    expect(approvalsContract.approveApproval.method).toBe("POST");
  });

  it("approveApproval's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(approvalsContract.approveApproval.body).toBe(EmptyBodySchema);
  });

  it("rejectApproval takes an optional reason (ZB-08 deny-with-reason), still accepting an empty body", () => {
    const body = approvalsContract.rejectApproval.body;
    expect(body.safeParse({}).success).toBe(true);
    expect(body.safeParse(undefined).success).toBe(true);
    expect(body.safeParse({ reason: "Not now" }).success).toBe(true);
    expect(body.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("approval schema", () => {
  const base = {
    id: "agent_1_ab",
    runId: "agent-007_1_p0",
    kind: "agent",
    skill: "Agent 007",
    action: "run",
    detail: "do the thing",
    risk: "high",
    status: "pending",
    requestedAt: new Date().toISOString(),
  };

  it("accepts a pending approval and an approved one with decidedAt", () => {
    expect(ApprovalSchema.safeParse(base).success).toBe(true);
    expect(
      ApprovalSchema.safeParse({ ...base, status: "approved", decidedAt: new Date().toISOString() })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown kind or risk", () => {
    expect(ApprovalSchema.safeParse({ ...base, kind: "wizard" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...base, risk: "extreme" }).success).toBe(false);
  });

  it("accepts the budget-override kind 'task' (Phase 8.1)", () => {
    expect(
      ApprovalSchema.safeParse({ ...base, kind: "task", action: "spend-past-cap" }).success,
    ).toBe(true);
  });

  describe("department (NS2 F3c)", () => {
    it("accepts a department-tagged approval", () => {
      const parsed = ApprovalSchema.safeParse({ ...base, department: "dev" });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.department).toBe("dev");
    });

    it("is omissible — every pre-existing approval re-parses untouched", () => {
      const parsed = ApprovalSchema.safeParse(base);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.department).toBeUndefined();
    });

    it("rejects an id outside the closed department enum", () => {
      expect(ApprovalSchema.safeParse({ ...base, department: "warp-drive" }).success).toBe(false);
    });
  });

  describe("sourceUrl (Phase 127)", () => {
    it("accepts a link back to the item's origin", () => {
      const parsed = ApprovalSchema.safeParse({
        ...base,
        sourceUrl: "https://github.com/acme/repo/issues/42",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.sourceUrl).toBe("https://github.com/acme/repo/issues/42");
      }
    });

    it("is omissible — every pre-existing approval re-parses untouched", () => {
      const parsed = ApprovalSchema.safeParse(base);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.sourceUrl).toBeUndefined();
    });
  });
});
