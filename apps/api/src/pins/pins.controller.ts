import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { pinsContract } from "@zibby/contracts";
import { PinsStore } from "./pins.store";

@Controller()
export class PinsController {
  constructor(private readonly pins: PinsStore) {}

  @TsRestHandler(pinsContract)
  handler() {
    return tsRestHandler(pinsContract, {
      getPins: async () => ({ status: 200, body: await this.pins.read() }),
      putPins: async ({ body }) => ({ status: 200, body: await this.pins.write(body) }),
    });
  }
}
