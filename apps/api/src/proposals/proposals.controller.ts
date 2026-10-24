import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { proposalsContract } from "@zibby/contracts";
import {
  ProposalConflictError,
  ProposalNotFoundError,
  ProposalsService,
} from "./proposals.service";

/**
 * Implements `proposalsContract` (TODO 14): list the open, unexpired proposals;
 * dismiss or edit one. Unknown id → 404; edit of an agent-factory proposal or any
 * decision on a dismissed one → 409.
 */
@Controller()
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @TsRestHandler(proposalsContract)
  handler() {
    return tsRestHandler(proposalsContract, {
      listProposals: async () => ({ status: 200, body: await this.proposals.list() }),

      decideProposal: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.proposals.decide(id, body) };
        } catch (err) {
          if (err instanceof ProposalNotFoundError) {
            return { status: 404, body: { message: err.message } };
          }
          if (err instanceof ProposalConflictError) {
            return { status: 409, body: { message: err.message } };
          }
          throw err;
        }
      },
    });
  }
}
