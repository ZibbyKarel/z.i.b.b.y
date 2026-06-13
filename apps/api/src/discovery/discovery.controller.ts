import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { discoveryContract } from "@zibby/contracts"
import { ProposalsStorageService } from "./proposals.storage.service"

/** Implements `discoveryContract` — a read-only view of proposals (the gate is the inbox). */
@Controller()
export class DiscoveryController {
  constructor(private readonly proposals: ProposalsStorageService) {}

  @TsRestHandler(discoveryContract)
  handler() {
    return tsRestHandler(discoveryContract, {
      listProposals: async () => {
        const all = await this.proposals.list()
        return { status: 200, body: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
      },
    })
  }
}
