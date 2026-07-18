import { Module } from "@nestjs/common";
import { AutomationsModule } from "../automations/automations.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MemoryModule } from "../memory/memory.module";
import { ClaudeRunModule } from "../runner/claude-run.module";
import { HealthController } from "./health.controller";
import { SubsystemHealthService } from "./subsystem-health.service";

/**
 * Health/readiness. ClaudeRunModule exports the preflight probe; MemoryModule,
 * IntegrationsModule and AutomationsModule export the services the per-subsystem
 * probe reads (vault / integrations / scheduler). None of those import HealthModule,
 * so there is no cycle. The F6c `watchers[]` probe comes from the @Global
 * WatcherHealthModule (watchers register into it; it imports none of them).
 */
@Module({
  imports: [ClaudeRunModule, MemoryModule, IntegrationsModule, AutomationsModule],
  controllers: [HealthController],
  providers: [SubsystemHealthService],
})
export class HealthModule {}
