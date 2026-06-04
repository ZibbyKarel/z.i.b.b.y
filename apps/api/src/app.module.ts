import { Module } from "@nestjs/common"
import { AgentsModule } from "./agents/agents.module"
import { ApprovalsModule } from "./approvals/approvals.module"
import { HealthModule } from "./health/health.module"
import { LimitsModule } from "./limits/limits.module"
import { PipelinesModule } from "./pipelines/pipelines.module"
import { SkillsModule } from "./skills/skills.module"

@Module({
  imports: [AgentsModule, SkillsModule, PipelinesModule, ApprovalsModule, HealthModule, LimitsModule],
})
export class AppModule {}
