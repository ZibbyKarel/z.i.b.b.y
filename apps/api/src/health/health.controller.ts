import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { healthContract } from "@zibby/contracts";
import { ClaudePreflightService } from "../runner/claude-preflight.service";
import { DepartmentHealthService } from "./department-health.service";
import { WatcherHealthRegistry } from "./watcher-health.registry";

/**
 * Implements `healthContract`. Process liveness needs no I/O — if the process
 * can answer, it is alive — but readiness includes the Claude CLI preflight AND a
 * per-department probe (vault, integrations, scheduler). Overall status degrades if
 * claude-shaped runs would be refused OR any department is not `ok`, so the dashboard
 * never has to infer a fault from silence (M8).
 */
@Controller()
export class HealthController {
  constructor(
    private readonly preflight: ClaudePreflightService,
    private readonly departments: DepartmentHealthService,
    private readonly watchers: WatcherHealthRegistry,
  ) {}

  @TsRestHandler(healthContract)
  handler() {
    return tsRestHandler(healthContract, {
      getHealth: async () => {
        const [claude, departments] = await Promise.all([
          this.preflight.probe(),
          this.departments.probeAll(),
        ]);
        // F6c: `watchers[]` is informational — a stale watcher deliberately does
        // NOT flip the overall status to degraded in v1 (fail-open; it surfaces
        // as a briefing line and a settings-HUD indicator instead).
        const degraded = !claude.ok || departments.some((s) => s.status !== "ok");
        return {
          status: 200,
          body: {
            status: degraded ? ("degraded" as const) : ("ok" as const),
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            claude,
            departments,
            watchers: this.watchers.all(),
          },
        };
      },
    });
  }
}
