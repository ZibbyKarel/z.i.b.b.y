import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { ApprovalSchema } from "./approval.schema";

const c = initContract();

const ApprovalIdParam = z.object({ id: z.string().min(1) });

/**
 * The approval gate (Phase 3). A gated run pauses at `awaiting-approval` and a
 * pending {@link ApprovalSchema} is created; a human approves (the run resumes) or
 * rejects (the run terminates without performing its action). Polled, like runs.
 */
export const approvalsContract = c.router(
  {
    listPendingApprovals: {
      method: "GET",
      path: "/approvals",
      query: z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }),
      responses: { 200: z.array(ApprovalSchema) },
      summary: "List approvals (defaults to all; filter by status)",
    },
    getApproval: {
      method: "GET",
      path: "/approvals/:id",
      pathParams: ApprovalIdParam,
      responses: { 200: ApprovalSchema, 404: ErrorSchema },
      summary: "Get a single approval by id",
    },
    approveApproval: {
      method: "POST",
      path: "/approvals/:id/approve",
      pathParams: ApprovalIdParam,
      body: z.object({}).optional(),
      responses: { 200: ApprovalSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Approve a pending approval (resumes the gated run)",
    },
    rejectApproval: {
      method: "POST",
      path: "/approvals/:id/reject",
      pathParams: ApprovalIdParam,
      body: z.object({}).optional(),
      responses: { 200: ApprovalSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Reject a pending approval (terminates the gated run, no action taken)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ApprovalsContract = typeof approvalsContract;
