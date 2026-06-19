import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { systemContract } from "@zibby/contracts"
import { SystemConfigStore } from "./system-config.store"

/** Implements `systemContract` — the operator-owned runtime system config. */
@Controller()
export class SystemController {
  constructor(private readonly config: SystemConfigStore) {}

  @TsRestHandler(systemContract)
  handler() {
    return tsRestHandler(systemContract, {
      getConfig: async () => ({ status: 200, body: await this.config.read() }),
      putConfig: async ({ body }) => ({ status: 200, body: await this.config.write(body) }),
    })
  }
}
