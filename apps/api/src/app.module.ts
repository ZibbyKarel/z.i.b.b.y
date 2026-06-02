import { Module } from "@nestjs/common"
import { AgentsModule } from "./agents/agents.module"
import { HealthModule } from "./health/health.module"
import { LimitsModule } from "./limits/limits.module"

@Module({
  imports: [AgentsModule, HealthModule, LimitsModule],
})
export class AppModule {}
