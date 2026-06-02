import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { healthContract } from "@zibby/contracts"

/**
 * Implements `healthContract`. The endpoint touches no I/O — if the process can
 * answer, it is alive — so it simply reports process uptime and the current time.
 */
@Controller()
export class HealthController {
  @TsRestHandler(healthContract)
  handler() {
    return tsRestHandler(healthContract, {
      getHealth: async () => ({
        status: 200,
        body: {
          status: "ok" as const,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      }),
    })
  }
}
