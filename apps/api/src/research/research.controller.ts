import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { researchContract } from "@zibby/contracts"
import { ResearchConfigStore } from "./research-config.store"
import { ResearchService } from "./research.service"

/** Implements `researchContract` — operator research config + the digest pass. */
@Controller()
export class ResearchController {
  constructor(
    private readonly config: ResearchConfigStore,
    private readonly research: ResearchService,
  ) {}

  @TsRestHandler(researchContract)
  handler() {
    return tsRestHandler(researchContract, {
      getConfig: async () => ({ status: 200, body: await this.config.read() }),
      putConfig: async ({ body }) => ({ status: 200, body: await this.config.write(body) }),
      getDigest: async () => ({ status: 200, body: await this.research.latest() }),
      refresh: async () => ({ status: 200, body: await this.research.refresh() }),
    })
  }
}
