import { describe, expect, it } from "vitest"
import { ApprovalSchema, approvalsContract } from "../index"

describe("approvalsContract", () => {
  it("exposes list/get/approve/reject under /api/approvals", () => {
    expect(approvalsContract.listPendingApprovals.path).toBe("/api/approvals")
    expect(approvalsContract.getApproval.path).toBe("/api/approvals/:id")
    expect(approvalsContract.approveApproval.path).toBe("/api/approvals/:id/approve")
    expect(approvalsContract.rejectApproval.path).toBe("/api/approvals/:id/reject")
    expect(approvalsContract.approveApproval.method).toBe("POST")
  })
})

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
  }

  it("accepts a pending approval and an approved one with decidedAt", () => {
    expect(ApprovalSchema.safeParse(base).success).toBe(true)
    expect(
      ApprovalSchema.safeParse({ ...base, status: "approved", decidedAt: new Date().toISOString() })
        .success,
    ).toBe(true)
  })

  it("rejects an unknown kind or risk", () => {
    expect(ApprovalSchema.safeParse({ ...base, kind: "wizard" }).success).toBe(false)
    expect(ApprovalSchema.safeParse({ ...base, risk: "extreme" }).success).toBe(false)
  })
})
