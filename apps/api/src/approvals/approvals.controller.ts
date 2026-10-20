import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { approvalsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  ApprovalAlreadyDecidedError,
  ApprovalNotAnswerableError,
  ApprovalNotFoundError,
  ApprovalNotRevisableError,
  InvalidApprovalIdError,
} from "./approvals.errors";
import { ApprovalsService } from "./approvals.service";
import { OperatorTokenGuard } from "./operator-token.guard";

const errors = makeErrorMapper("Approval", {
  missing: [ApprovalNotFoundError, InvalidApprovalIdError],
});

/** Deciding an already-decided (or revising a non-checkpoint / answering a non-question) approval → 409. */
const decided = (error: unknown) =>
  error instanceof ApprovalAlreadyDecidedError ||
  error instanceof ApprovalNotRevisableError ||
  error instanceof ApprovalNotAnswerableError
    ? ({ status: 409, body: { message: error.message } } as const)
    : undefined;

/**
 * Implements `approvalsContract` against {@link ApprovalsService}. Missing/unsafe
 * id → 404; deciding an already-decided approval → 409.
 */
@Controller()
@UseGuards(OperatorTokenGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @TsRestHandler(approvalsContract)
  handler() {
    return tsRestHandler(approvalsContract, {
      listPendingApprovals: async ({ query: { status } }) => ({
        status: 200,
        body: await this.approvals.list(status),
      }),

      getApproval: ({ params: { id } }) => errors.or404(id, () => this.approvals.get(id)),

      approveApproval: ({ params: { id }, body }) =>
        errors.or404(
          id,
          () => this.approvals.approve(id, { reviewEvent: body?.reviewEvent }),
          decided,
        ),

      rejectApproval: ({ params: { id }, body }) =>
        errors.or404(id, () => this.approvals.reject(id, body?.reason), decided),

      reviseApproval: ({ params: { id }, body }) =>
        errors.or404(id, () => this.approvals.revise(id, body.note), decided),

      answerApproval: ({ params: { id }, body }) =>
        errors.or404(id, () => this.approvals.answer(id, body.answer), decided),
    });
  }
}
