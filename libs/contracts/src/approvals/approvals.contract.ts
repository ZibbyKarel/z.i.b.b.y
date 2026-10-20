import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import { AnswerApprovalSchema, ApprovalSchema, PrReviewEventSchema } from "./approval.schema";

const c = initContract();

/** Header carrying the operator-only credential that authorizes deciding an approval. */
export const OPERATOR_TOKEN_HEADER = "x-zibby-operator-token";

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
      // todo-10: the operator's pick of the GitHub review event on a PR-review sign-off.
      // Optional and additive — a caller that posts `{}` (or nothing) gets COMMENT.
      body: z.object({ reviewEvent: PrReviewEventSchema.optional() }).optional(),
      responses: { 200: ApprovalSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Approve a pending approval (resumes the gated run)",
    },
    rejectApproval: {
      method: "POST",
      path: "/approvals/:id/reject",
      pathParams: ApprovalIdParam,
      // O-12: an optional operator note on the denial, additive alongside the
      // pre-existing empty body — a caller that still posts `{}` is unaffected.
      body: z.object({ reason: z.string().min(1).max(500).optional() }).optional(),
      responses: { 200: ApprovalSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Reject a pending approval (terminates the gated run, no action taken)",
    },
    reviseApproval: {
      method: "POST",
      path: "/approvals/:id/revise",
      pathParams: ApprovalIdParam,
      // "Request changes" on a workflow stage checkpoint: the gated phase re-runs
      // with the note as operator guidance, then parks at the same gate again.
      body: z.object({ note: z.string().trim().min(1).max(4000) }),
      responses: { 200: ApprovalSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Send a pending stage checkpoint back for rework with an operator note",
    },
    answerApproval: {
      method: "POST",
      path: "/approvals/:id/answer",
      pathParams: ApprovalIdParam,
      body: AnswerApprovalSchema,
      responses: { 200: ApprovalSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
      summary: "Answer an agent's operator.question approval (stores the answer, resumes the run)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type ApprovalsContract = typeof approvalsContract;
