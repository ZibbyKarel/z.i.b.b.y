import { Module } from "@nestjs/common"
import { AgentsModule } from "./agents/agents.module"
import { HealthModule } from "./health/health.module"

@Module({
  imports: [AgentsModule, HealthModule],
})
export class AppModule {}
