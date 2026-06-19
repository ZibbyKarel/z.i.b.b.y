import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { approvalsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  ApprovalAlreadyDecidedError,
  ApprovalNotFoundError,
  InvalidApprovalIdError,
} from "./approvals.errors";
import { ApprovalsService } from "./approvals.service";

const errors = makeErrorMapper("Approval", {
  missing: [ApprovalNotFoundError, InvalidApprovalIdError],
});

/** Deciding an already-decided approval → 409. */
const decided = (error: unknown) =>
  error instanceof ApprovalAlreadyDecidedError
    ? ({ status: 409, body: { message: error.message } } as const)
    : undefined;

/**
 * Implements `approvalsContract` against {@link ApprovalsService}. Missing/unsafe
 * id → 404; deciding an already-decided approval → 409.
 */
@Controller()
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

      approveApproval: ({ params: { id } }) =>
        errors.or404(id, () => this.approvals.approve(id), decided),

      rejectApproval: ({ params: { id } }) =>
        errors.or404(id, () => this.approvals.reject(id), decided),
    });
  }
}
