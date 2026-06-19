import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { limitsContract } from "@zibby/contracts";
import { LimitsService } from "./limits.service";

/**
 * Implements `limitsContract`. The usage computation lives in `LimitsService`;
 * the handler just adapts its snapshot to the ts-rest `{ status, body }` shape.
 */
@Controller()
export class LimitsController {
  constructor(private readonly limits: LimitsService) {}

  @TsRestHandler(limitsContract)
  handler() {
    return tsRestHandler(limitsContract, {
      getLimits: async () => ({
        status: 200,
        body: await this.limits.snapshot(),
      }),
    });
  }
}
