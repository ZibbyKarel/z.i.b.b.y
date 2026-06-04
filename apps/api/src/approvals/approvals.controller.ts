import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { approvalsContract } from "@zibby/contracts"
import {
  ApprovalAlreadyDecidedError,
  ApprovalNotFoundError,
  InvalidApprovalIdError,
} from "./approvals.errors"
import { ApprovalsService } from "./approvals.service"

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

      getApproval: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.approvals.get(id) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      approveApproval: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.approvals.approve(id) }
        } catch (error) {
          return decideError(error, id)
        }
      },

      rejectApproval: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.approvals.reject(id) }
        } catch (error) {
          return decideError(error, id)
        }
      },
    })
  }
}

function decideError(
  error: unknown,
  id: string,
): { status: 404; body: { message: string } } | { status: 409; body: { message: string } } {
  if (error instanceof ApprovalAlreadyDecidedError) {
    return { status: 409, body: { message: error.message } }
  }
  if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
  throw error
}

function isMissing(error: unknown): boolean {
  return error instanceof ApprovalNotFoundError || error instanceof InvalidApprovalIdError
}

function notFound(id: string): string {
  return `Approval "${id}" not found`
}
