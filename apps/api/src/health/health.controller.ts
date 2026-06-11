import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { healthContract } from "@zibby/contracts"
import { ClaudePreflightService } from "../runner/claude-preflight.service"

/**
 * Implements `healthContract`. Process liveness needs no I/O — if the process
 * can answer, it is alive — but readiness includes the Claude CLI preflight: a
 * failing probe degrades the status so the dashboard can warn that
 * claude-shaped runs would currently be refused.
 */
@Controller()
export class HealthController {
  constructor(private readonly preflight: ClaudePreflightService) {}

  @TsRestHandler(healthContract)
  handler() {
    return tsRestHandler(healthContract, {
      getHealth: async () => {
        const claude = await this.preflight.probe()
        return {
          status: 200,
          body: {
            status: claude.ok ? ("ok" as const) : ("degraded" as const),
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            claude,
          },
        }
      },
    })
  }
}
