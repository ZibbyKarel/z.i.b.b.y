import { Module } from "@nestjs/common"
import { AgentsModule } from "./agents/agents.module"
import { HealthModule } from "./health/health.module"
import { LimitsModule } from "./limits/limits.module"
import { SkillsModule } from "./skills/skills.module"

@Module({
  imports: [AgentsModule, SkillsModule, HealthModule, LimitsModule],
})
export class AppModule {}
