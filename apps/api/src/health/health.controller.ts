import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { healthContract } from "@zibby/contracts"
import { ClaudePreflightService } from "../runner/claude-preflight.service"
import { SubsystemHealthService } from "./subsystem-health.service"

/**
 * Implements `healthContract`. Process liveness needs no I/O — if the process
 * can answer, it is alive — but readiness includes the Claude CLI preflight AND a
 * per-subsystem probe (vault, integrations, scheduler). Overall status degrades if
 * claude-shaped runs would be refused OR any subsystem is not `ok`, so the dashboard
 * never has to infer a fault from silence (M8).
 */
@Controller()
export class HealthController {
  constructor(
    private readonly preflight: ClaudePreflightService,
    private readonly subsystems: SubsystemHealthService,
  ) {}

  @TsRestHandler(healthContract)
  handler() {
    return tsRestHandler(healthContract, {
      getHealth: async () => {
        const [claude, subsystems] = await Promise.all([
          this.preflight.probe(),
          this.subsystems.probeAll(),
        ])
        const degraded = !claude.ok || subsystems.some((s) => s.status !== "ok")
        return {
          status: 200,
          body: {
            status: degraded ? ("degraded" as const) : ("ok" as const),
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            claude,
            subsystems,
          },
        }
      },
    })
  }
}
