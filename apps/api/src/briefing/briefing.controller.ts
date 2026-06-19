import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { briefingContract } from "@zibby/contracts";
import { BriefingService } from "./briefing.service";

/** Implements `briefingContract`: a pure GET and a persisting POST /generate. */
@Controller()
export class BriefingController {
  constructor(private readonly briefing: BriefingService) {}

  @TsRestHandler(briefingContract)
  handler() {
    return tsRestHandler(briefingContract, {
      getBriefing: async () => ({ status: 200, body: await this.briefing.assemble() }),
      generateBriefing: async () => ({ status: 201, body: await this.briefing.generate() }),
    });
  }
}
